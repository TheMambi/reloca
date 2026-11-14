import "server-only";
import { createAdminClient, createClient, requireUserId } from "@/lib/supabase/server";
import { parseRows } from "@/lib/data/parse-rows";
import { ChecklistItemSchema, type ChecklistItem } from "@/schemas";
import { getChecklistSeed } from "@/lib/data/checklist";
import { fillSeedText, seededDueDate } from "@/lib/data/move-seeds";
import type { MoveContext } from "@/lib/data/relocation-db";

/**
 * Inserts the template tasks for a move, unless the user already has tasks.
 * Called once, when the user's first move is created. An empty list on a later
 * read is left empty: the person may have cleared it on purpose.
 *
 * Belt-and-suspenders idempotency: the read-then-write guard catches the
 * common case, and the upsert with ignoreDuplicates=true makes a concurrent
 * race against the UNIQUE(user_id, category, order_index) index harmless
 * (Phase 6 follow-up after a refresh-storm produced 40+ rows in production).
 */
export async function seedChecklistIfEmpty(move: MoveContext): Promise<void> {
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

  const rows = seed.map((item) => ({
    user_id: requireUserId(),
    category: item.category,
    title: fillSeedText(item.title, move),
    description: item.description && fillSeedText(item.description, move),
    due_date: seededDueDate(move.moveDate, item.daysOffsetFromMoveDate),
    order_index: item.orderIndex,
  }));

  const { error } = await admin
    .from("checklist_items")
    .upsert(rows, { onConflict: "user_id,category,order_index", ignoreDuplicates: true });
  if (error) throw new Error(`seedChecklistIfEmpty insert: ${error.message}`);
}

/** Live checklist items for the single-user UID. */
export async function getChecklistItems(): Promise<ChecklistItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("checklist_items")
    .select("*")
    .eq("user_id", requireUserId())
    .order("category", { ascending: true })
    .order("order_index", { ascending: true });

  if (error) throw new Error(`getChecklistItems: ${error.message}`);

  return parseRows(ChecklistItemSchema, data ?? [], "checklist_items");
}
