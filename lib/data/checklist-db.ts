import "server-only";
import { createClient, requireUserId } from "@/lib/supabase/server";
import { ChecklistItemSchema, type ChecklistItem } from "@/schemas";
import { seedChecklistIfEmpty } from "@/app/checklist/actions";


/**
 * Live checklist items for the single-user UID. Lazily seeds the table
 * from `data/checklist-seed.json` on first read so any RSC that needs
 * checklist data triggers the seed without a separate ceremony.
 */
export async function getChecklistItems(): Promise<ChecklistItem[]> {
  const supabase = await createClient();

  const initial = await supabase
    .from("checklist_items")
    .select("*")
    .eq("user_id", requireUserId())
    .order("category", { ascending: true })
    .order("order_index", { ascending: true });

  if (initial.error) throw new Error(`getChecklistItems: ${initial.error.message}`);

  let rows = initial.data ?? [];
  // Trigger the non-lease seed when no non-lease rows exist. Lease rows are
  // owned by seedLeaseChecklistTasks; their presence shouldn't suppress the
  // seed of the other 4 categories. The seedChecklistIfEmpty function is
  // race-safe (upsert on the unique index) so calling it on a "lease-only"
  // state is the right move — it will insert the missing non-lease seed rows.
  const hasNonLeaseRows = rows.some((r) => r.category !== "lease");
  if (!hasNonLeaseRows) {
    await seedChecklistIfEmpty();
    const reread = await supabase
      .from("checklist_items")
      .select("*")
      .eq("user_id", requireUserId())
      .order("category", { ascending: true })
      .order("order_index", { ascending: true });
    if (reread.error) throw new Error(`getChecklistItems re-read: ${reread.error.message}`);
    rows = reread.data ?? [];
  }

  return ChecklistItemSchema.array().parse(rows);
}
