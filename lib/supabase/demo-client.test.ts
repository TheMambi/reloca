// Run: npx tsx lib/supabase/demo-client.test.ts
import assert from "node:assert/strict";
import { createDemoClient } from "./demo-client";
import { DEMO_SEED, DEMO_USER_ID } from "./demo-seed";
import {
  AddressChangeTargetSchema,
  UtilityTransitionSchema,
} from "@/schemas/transitions";
import {
  DestinationSchema,
  InsurancePolicySchema,
  LeaseEventSchema,
  LeaseTermsSchema,
  NoticeDraftSchema,
} from "@/schemas/lease";
import { MoveEstimateSchema } from "@/schemas/move-cost";

async function main() {
  const db = createDemoClient();

  // Seed rows satisfy the same Zod schemas the loaders parse with.
  const parsers: [string, { parse: (v: unknown) => unknown }][] = [
    ["lease_terms", LeaseTermsSchema],
    ["lease_events", LeaseEventSchema],
    ["notice_drafts", NoticeDraftSchema],
    ["destinations", DestinationSchema],
    ["insurance_policies", InsurancePolicySchema],
    ["utility_transitions", UtilityTransitionSchema],
    ["address_change_targets", AddressChangeTargetSchema],
    ["move_estimates", MoveEstimateSchema],
  ];
  for (const [name, schema] of parsers) {
    const { data, error } = await db.from(name).select("*");
    assert.equal(error, null, `${name} select`);
    for (const row of data as unknown[]) schema.parse(row);
  }

  // Insert fills defaults, id and timestamps; missing columns come back null.
  const ins = await db
    .from("checklist_items")
    .insert({ user_id: DEMO_USER_ID, category: "pre-move", title: "Test task" })
    .select("*")
    .single();
  assert.equal(ins.error, null);
  const row = ins.data as Record<string, unknown>;
  assert.equal(row.completed, false, "default completed");
  assert.equal(row.order_index, 0, "default order_index");
  assert.equal(row.description, null, "missing column is null");
  assert.match(String(row.id), /^[0-9a-f-]{36}$/, "uuid id");

  // Insert without .select() returns no data.
  const quiet = await db.from("checklist_items").insert({ user_id: DEMO_USER_ID, category: "post-move", title: "Quiet" });
  assert.equal(quiet.data, null);

  // update + eq + maybeSingle round trip.
  await db.from("checklist_items").update({ completed: true }).eq("id", row.id);
  const back = await db.from("checklist_items").select("completed").eq("id", row.id).maybeSingle();
  assert.deepEqual(back.data, { completed: true }, "column projection + update");

  // single() errors on zero rows, maybeSingle() does not.
  const none = await db.from("checklist_items").select("*").eq("id", "missing").single();
  assert.ok(none.error, "single on zero rows errors");
  const maybe = await db.from("checklist_items").select("*").eq("id", "missing").maybeSingle();
  assert.equal(maybe.error, null);
  assert.equal(maybe.data, null);

  // Ascending order puts nulls last (Postgres default).
  const ordered = await db.from("checklist_items").select("due_date").order("due_date", { ascending: true });
  const dates = (ordered.data as { due_date: string | null }[]).map((r) => r.due_date);
  const firstNull = dates.indexOf(null);
  assert.ok(firstNull === -1 || dates.slice(firstNull).every((d) => d === null), "nulls last");

  // count + head.
  const counted = await db.from("checklist_items").select("id", { count: "exact", head: true }).eq("category", "lease");
  assert.equal(counted.data, null);
  assert.equal(counted.count, DEMO_SEED.checklist_items.filter((r) => r.category === "lease").length);

  // upsert with ignoreDuplicates leaves the existing row alone.
  const before = await db.from("saved_neighborhoods").select("*");
  await db
    .from("saved_neighborhoods")
    .upsert({ user_id: DEMO_USER_ID, neighborhood: "Downtown", city: "Long Beach" }, { onConflict: "user_id,neighborhood,city", ignoreDuplicates: true });
  const afterUpsert = await db.from("saved_neighborhoods").select("*");
  assert.equal((afterUpsert.data as unknown[]).length, (before.data as unknown[]).length, "duplicate ignored");

  // delete + in.
  await db.from("checklist_items").delete().in("title", ["Test task", "Quiet"]);
  const gone = await db.from("checklist_items").select("id").in("title", ["Test task", "Quiet"]);
  assert.equal((gone.data as unknown[]).length, 0, "deleted");

  // reorder moves an item to the front of another category and renumbers.
  const preMove = await db.from("checklist_items").select("*").eq("category", "pre-move").order("order_index");
  const last = (preMove.data as { id: string }[]).at(-1)!;
  const rpc = await db.rpc("reorder_checklist_item", { p_id: last.id, p_target_category: "move-week", p_target_index: 0 });
  assert.equal(rpc.error, null);
  const moved = await db.from("checklist_items").select("*").eq("category", "move-week").order("order_index");
  const mw = moved.data as { id: string; order_index: number }[];
  assert.equal(mw[0].id, last.id, "moved to index 0");
  assert.deepEqual(mw.map((r) => r.order_index), mw.map((_, i) => i), "renumbered 0..n");

  // Memory limits: an oversized write and a table past its row cap are refused.
  const huge = await db.from("checklist_items").insert({ user_id: DEMO_USER_ID, category: "pre-move", title: "x".repeat(1_100_000) });
  assert.ok(huge.error, "oversized write refused");
  let capped = null;
  for (let i = 0; i < 120 && !capped; i++) {
    const r = await db.from("lease_events").insert({ user_id: DEMO_USER_ID, kind: "note", occurs_on: "2026-10-01" });
    capped = r.error;
  }
  assert.ok(capped, "row cap reached");

  console.log("demo-client.test.ts ✅");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
