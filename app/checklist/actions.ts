"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, requireUserId } from "@/lib/supabase/server";
import { ChecklistPhaseSchema, type ChecklistPhase } from "@/schemas";


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

type AppClient = Awaited<ReturnType<typeof createClient>>;

// Deleting a row or moving it to another phase leaves a hole in its old
// phase's numbering. Going upward, each row's new number is one no row holds,
// so the unique (user, category, order) index is never tripped on the way.
async function closeOrderGaps(sb: AppClient, userId: string, category: ChecklistPhase): Promise<void> {
  const { data, error } = await sb
    .from("checklist_items")
    .select("id, order_index")
    .eq("user_id", userId)
    .eq("category", category)
    .order("order_index", { ascending: true });
  if (error) throw new Error(`closeOrderGaps.read: ${error.message}`);
  for (const [rank, row] of (data ?? []).entries()) {
    if (row.order_index === rank) continue;
    const { error: writeErr } = await sb
      .from("checklist_items")
      .update({ order_index: rank })
      .eq("id", row.id)
      .eq("user_id", userId);
    if (writeErr) throw new Error(`closeOrderGaps.write: ${writeErr.message}`);
  }
}

const ChecklistCreateInput = z.object({
  category: ChecklistPhaseSchema,
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
  const userId = requireUserId();

  // When the patch moves the row to a new category, recompute order_index in
  // the destination so the UNIQUE(user_id, category, order_index) index doesn't
  // trip on a collision with an existing row at the same index in that
  // category.
  const updateBody: typeof parsed & { order_index?: number } = { ...parsed };
  let movedFrom: ChecklistPhase | null = null;
  if (parsed.category !== undefined) {
    const { data: current, error: readErr } = await sb
      .from("checklist_items")
      .select("category")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (readErr)
      throw new Error(`updateChecklistItem.read: ${readErr.message}`);
    if (!current)
      throw new Error(`updateChecklistItem: row ${id} not found`);
    if (current.category === "lease")
      throw new Error("updateChecklistItem: a lease task cannot change phase");
    if (current.category !== parsed.category) movedFrom = current.category;

    if (current.category !== parsed.category) {
      const { data: maxRow, error: maxErr } = await sb
        .from("checklist_items")
        .select("order_index")
        .eq("user_id", userId)
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
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(`updateChecklistItem: ${error.message}`);
  if (movedFrom) await closeOrderGaps(sb, userId, movedFrom);
  revalidatePath("/checklist");
  revalidatePath("/");
}

export async function deleteChecklistItem(id: string): Promise<void> {
  const sb = await createClient();
  const userId = requireUserId();
  const { data: row, error: readErr } = await sb
    .from("checklist_items")
    .select("category")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (readErr) throw new Error(`deleteChecklistItem.read: ${readErr.message}`);
  const { error } = await sb
    .from("checklist_items")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) throw new Error(`deleteChecklistItem: ${error.message}`);
  // Lease tasks keep the numbers the lease code gave them.
  if (row && row.category !== "lease") await closeOrderGaps(sb, userId, row.category);
  revalidatePath("/checklist");
  revalidatePath("/");
}

const ReorderInput = z.object({
  id: z.uuid(),
  targetCategory: ChecklistPhaseSchema,
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
  // The function finds the row by id alone, and the service-role key skips row
  // level security, so ownership is checked here before calling it.
  const { data: owned, error: readErr } = await sb
    .from("checklist_items")
    .select("id, category")
    .eq("id", parsed.id)
    .eq("user_id", requireUserId())
    .maybeSingle();
  if (readErr) throw new Error(`reorderChecklistItem.read: ${readErr.message}`);
  if (!owned) throw new Error(`reorderChecklistItem: row ${parsed.id} not found`);
  if (owned.category === "lease") throw new Error("reorderChecklistItem: lease tasks do not reorder");
  const { error } = await sb.rpc("reorder_checklist_item", {
    p_id: parsed.id,
    p_target_category: parsed.targetCategory,
    p_target_index: parsed.targetIndex,
  });
  if (error) throw new Error(`reorderChecklistItem: ${error.message}`);
  revalidatePath("/checklist");
  revalidatePath("/");
}
