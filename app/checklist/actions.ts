"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, requireUserId } from "@/lib/supabase/server";
import { ActionFailure, dbFailure, runAction, type ActionResult } from "@/lib/action-result";
import { ChecklistCategorySchema, ChecklistPhaseSchema, type ChecklistPhase } from "@/schemas";


const ToggleInput = z.object({
  id: z.uuid(),
  completed: z.boolean(),
});

export async function toggleChecklistItem(input: { id: string; completed: boolean }): Promise<ActionResult> {
  return runAction("toggleChecklistItem", async () => {
    const { id, completed } = ToggleInput.parse(input);
    const supabase = await createClient();
    const { error } = await supabase
      .from("checklist_items")
      .update({ completed })
      .eq("id", id)
      .eq("user_id", requireUserId());
    if (error) throw dbFailure("toggleChecklistItem", error);
    revalidatePath("/checklist");
    revalidatePath("/");
  });
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
  if (error) throw dbFailure("closeOrderGaps.read", error);
  for (const [rank, row] of (data ?? []).entries()) {
    if (row.order_index === rank) continue;
    const { error: writeErr } = await sb
      .from("checklist_items")
      .update({ order_index: rank })
      .eq("id", row.id)
      .eq("user_id", userId);
    if (writeErr) throw dbFailure("closeOrderGaps.write", writeErr);
  }
}

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 2000;
const GONE = "That task no longer exists.";

const ChecklistCreateInput = z.object({
  category: ChecklistPhaseSchema,
  title: z.string().min(1).max(TITLE_MAX),
  description: z.string().max(DESCRIPTION_MAX).nullable(),
  due_date: z.iso.date().nullable(),
});

export async function createChecklistItem(
  input: z.input<typeof ChecklistCreateInput>,
): Promise<ActionResult<{ id: string }>> {
  return runAction("createChecklistItem", async () => {
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
    if (maxErr) throw dbFailure("createChecklistItem.maxOrder", maxErr);
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
    if (error) throw dbFailure("createChecklistItem.insert", error);

    revalidatePath("/checklist");
    revalidatePath("/");
    return { id: data.id };
  });
}

const ChecklistUpdatePatch = ChecklistCreateInput.partial();

export async function updateChecklistItem(
  id: string,
  patch: z.input<typeof ChecklistUpdatePatch>,
): Promise<ActionResult> {
  return runAction("updateChecklistItem", async () => {
    z.uuid().parse(id);
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
        throw dbFailure("updateChecklistItem.read", readErr);
      if (!current) throw new ActionFailure(GONE);
      // The column is text to the database client. The schema narrows it.
      const from = ChecklistCategorySchema.parse(current.category);
      if (from === "lease") throw new ActionFailure("Lease tasks stay in the lease group.");
      if (from !== parsed.category) movedFrom = from;

      if (from !== parsed.category) {
        const { data: maxRow, error: maxErr } = await sb
          .from("checklist_items")
          .select("order_index")
          .eq("user_id", userId)
          .eq("category", parsed.category)
          .order("order_index", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (maxErr)
          throw dbFailure("updateChecklistItem.maxOrder", maxErr);
        updateBody.order_index = (maxRow?.order_index ?? -1) + 1;
      }
    }

    const { error } = await sb
      .from("checklist_items")
      .update(updateBody)
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw dbFailure("updateChecklistItem", error);
    if (movedFrom) await closeOrderGaps(sb, userId, movedFrom);
    revalidatePath("/checklist");
    revalidatePath("/");
  });
}

export async function deleteChecklistItem(id: string): Promise<ActionResult> {
  return runAction("deleteChecklistItem", async () => {
    z.uuid().parse(id);
    const sb = await createClient();
    const userId = requireUserId();
    const { data: row, error: readErr } = await sb
      .from("checklist_items")
      .select("category")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (readErr) throw dbFailure("deleteChecklistItem.read", readErr);
    const { error } = await sb
      .from("checklist_items")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);
    if (error) throw dbFailure("deleteChecklistItem", error);
    // Lease tasks keep the numbers the lease code gave them.
    const from = row && ChecklistCategorySchema.parse(row.category);
    if (from && from !== "lease") await closeOrderGaps(sb, userId, from);
    revalidatePath("/checklist");
    revalidatePath("/");
  });
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
): Promise<ActionResult> {
  return runAction("reorderChecklistItem", async () => {
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
    if (readErr) throw dbFailure("reorderChecklistItem.read", readErr);
    if (!owned) throw new ActionFailure(GONE);
    if (owned.category === "lease") throw new ActionFailure("Lease tasks stay in the order the lease sets.");
    const { error } = await sb.rpc("reorder_checklist_item", {
      p_id: parsed.id,
      p_target_category: parsed.targetCategory,
      p_target_index: parsed.targetIndex,
    });
    if (error) throw dbFailure("reorderChecklistItem", error);
    revalidatePath("/checklist");
    revalidatePath("/");
  });
}
