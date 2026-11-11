"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, createAdminClient, requireUserId } from "@/lib/supabase/server";
import { getActiveMoveContext } from "@/lib/data/relocation-db";
import { getChecklistSeed } from "@/lib/data/checklist";
import { ChecklistCategorySchema } from "@/schemas";


const ToggleInput = z.object({
  id: z.uuid(),
  completed: z.boolean(),
});

export async function toggleChecklistItem(input: { id: string; completed: boolean }) {
  const { id, completed } = ToggleInput.parse(input);
  const supabase = await createClient();
  const { error } = await supabase
    .from("checklist_items")
    .update({ completed })
    .eq("id", id)
    .eq("user_id", requireUserId());
  if (error) throw new Error(`toggleChecklistItem: ${error.message}`);
  revalidatePath("/checklist");
  revalidatePath("/");
}

/**
 * Idempotent seed: if the user has zero rows, insert the seed template.
 * Uses the admin client because the seed runs before any user session
 * exists; RLS would also permit it (policy matches the env UUID), but
 * service-role makes intent explicit and survives any future RLS tightening.
 *
 * Belt-and-suspenders idempotency: the read-then-write guard catches the
 * common case, and the upsert with ignoreDuplicates=true makes a concurrent
 * race against the UNIQUE(user_id, category, order_index) index harmless
 * (Phase 6 follow-up after a refresh-storm produced 40+ rows in production).
 */
export async function seedChecklistIfEmpty(): Promise<void> {
  const admin = createAdminClient();
  // Lease-category rows are owned by seedLeaseChecklistTasks, not this seeder.
  // The empty-check must exclude them or this guard fires after lease seeding
  // and the non-lease seed rows never get inserted.
  const { data: existing, error: countError } = await admin
    .from("checklist_items")
    .select("id")
    .eq("user_id", requireUserId())
    .neq("category", "lease")
    .limit(1);
  if (countError) {
    throw new Error(
      `seedChecklistIfEmpty count: ${countError.message}${countError.code ? ` (${countError.code})` : ""}`,
    );
  }
  if ((existing?.length ?? 0) > 0) return;

  const seed = getChecklistSeed();
  const { moveDate: moveDateIso } = await getActiveMoveContext();

  const rows = seed.map((item) => ({
    user_id: requireUserId(),
    category: item.category,
    title: item.title,
    description: item.description,
    due_date: moveDateIso ? offsetDate(moveDateIso, item.daysOffsetFromMoveDate) : null,
    order_index: item.orderIndex,
  }));

  const { error } = await admin
    .from("checklist_items")
    .upsert(rows, { onConflict: "user_id,category,order_index", ignoreDuplicates: true });
  if (error) throw new Error(`seedChecklistIfEmpty insert: ${error.message}`);
}

function offsetDate(moveDateIso: string, days: number): string {
  const d = new Date(`${moveDateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const ChecklistCreateInput = z.object({
  category: ChecklistCategorySchema,
  title: z.string().min(1),
  description: z.string().nullable(),
  due_date: z.iso.date().nullable(),
});

export async function createChecklistItem(
  input: z.input<typeof ChecklistCreateInput>,
): Promise<{ id: string }> {
  const parsed = ChecklistCreateInput.parse(input);
  const sb = await createClient();
  const userId = requireUserId();

  // Compute next order_index for this category to avoid collision with
  // seed rows (which occupy order_index 0..N) and other user-created rows.
  const { data: maxRow, error: maxErr } = await sb
    .from("checklist_items")
    .select("order_index")
    .eq("user_id", userId)
    .eq("category", parsed.category)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) throw new Error(`createChecklistItem.maxOrder: ${maxErr.message}`);
  const nextOrder = (maxRow?.order_index ?? -1) + 1;

  const { data, error } = await sb
    .from("checklist_items")
    .insert({
      user_id: userId,
      category: parsed.category,
      title: parsed.title,
      description: parsed.description,
      due_date: parsed.due_date,
      completed: false,
      order_index: nextOrder,
    })
    .select("id")
    .single();
  if (error) throw new Error(`createChecklistItem.insert: ${error.message}`);

  revalidatePath("/checklist");
  revalidatePath("/");
  return { id: data.id };
}

const ChecklistUpdatePatch = ChecklistCreateInput.partial();

export async function updateChecklistItem(
  id: string,
  patch: z.input<typeof ChecklistUpdatePatch>,
): Promise<void> {
  const parsed = ChecklistUpdatePatch.parse(patch);
  const sb = await createClient();

  // When the patch moves the row to a new category, recompute order_index in
  // the destination so the UNIQUE(user_id, category, order_index) index doesn't
  // trip on a collision with an existing row at the same index in that
  // category.
  const updateBody: typeof parsed & { order_index?: number } = { ...parsed };
  if (parsed.category !== undefined) {
    const { data: current, error: readErr } = await sb
      .from("checklist_items")
      .select("user_id, category")
      .eq("id", id)
      .maybeSingle();
    if (readErr)
      throw new Error(`updateChecklistItem.read: ${readErr.message}`);
    if (!current)
      throw new Error(`updateChecklistItem: row ${id} not found`);

    if (current.category !== parsed.category) {
      const { data: maxRow, error: maxErr } = await sb
        .from("checklist_items")
        .select("order_index")
        .eq("user_id", current.user_id)
        .eq("category", parsed.category)
        .order("order_index", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (maxErr)
        throw new Error(`updateChecklistItem.maxOrder: ${maxErr.message}`);
      updateBody.order_index = (maxRow?.order_index ?? -1) + 1;
    }
  }

  const { error } = await sb
    .from("checklist_items")
    .update(updateBody)
    .eq("id", id);
  if (error) throw new Error(`updateChecklistItem: ${error.message}`);
  revalidatePath("/checklist");
  revalidatePath("/");
}

export async function deleteChecklistItem(id: string): Promise<void> {
  const sb = await createClient();
  const { error } = await sb.from("checklist_items").delete().eq("id", id);
  if (error) throw new Error(`deleteChecklistItem: ${error.message}`);
  revalidatePath("/checklist");
  revalidatePath("/");
}

const ReorderInput = z.object({
  id: z.uuid(),
  targetCategory: ChecklistCategorySchema,
  targetIndex: z.number().int().nonnegative(),
});

// Drag-and-drop persistence. Delegates the index-shifting work to a Postgres
// RPC (`reorder_checklist_item`) so all the row updates land in one
// transaction without tripping the (user_id, category, order_index) UNIQUE
// index. The RPC validates the target category and parks the moved row at
// order_index = -1 while it shifts neighbours into place.
export async function reorderChecklistItem(
  input: z.input<typeof ReorderInput>,
): Promise<void> {
  const parsed = ReorderInput.parse(input);
  const sb = await createClient();
  const { error } = await sb.rpc("reorder_checklist_item", {
    p_id: parsed.id,
    p_target_category: parsed.targetCategory,
    p_target_index: parsed.targetIndex,
  });
  if (error) throw new Error(`reorderChecklistItem: ${error.message}`);
  revalidatePath("/checklist");
  revalidatePath("/");
}
