// Run: npx tsx --conditions=react-server lib/checklist/checklist-flow.test.ts
//
// The real checklist actions against the in-memory demo database: numbering
// stays dense after a delete, lease tasks stay out of reordering, and a
// cleared list stays cleared.
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { join } from "node:path";

process.env.RELOCA_MODE = "demo";

// Server actions call into Next's request machinery, which exists only inside
// a running server. Stand-ins go into the module cache before the app loads.
const appRequire = createRequire(join(process.cwd(), "package.json"));
function standIn(specifier: string, exports: object) {
  const file = appRequire.resolve(specifier);
  const mod = new Module(file);
  mod.exports = exports;
  mod.loaded = true;
  appRequire.cache[file] = mod;
}
standIn("next/cache", { revalidatePath() {}, revalidateTag() {} });
standIn("next/server", { connection: async () => {} });
standIn("next/headers", {
  cookies: async () => ({ get: () => undefined, set() {}, delete() {} }),
  headers: async () => new Headers(),
});

/** The success branch of an action's answer. A reported failure fails the test. */
function ok<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  assert.ok(result.ok, `the action reported a failure: ${JSON.stringify(result)}`);
  return result as Extract<T, { ok: true }>;
}
/** The action must answer with a failure and a plain sentence, not throw. */
async function refused(call: Promise<{ ok: boolean; error?: string }>, sentence?: RegExp): Promise<void> {
  const result = await call;
  assert.equal(result.ok, false);
  assert.doesNotMatch(result.error ?? "", /[a-z]_[a-z]|\b(?:row|column|constraint|relation|uuid|null)\b/i, "no database wording");
  if (sentence) assert.match(result.error ?? "", sentence);
}

async function main() {
  const { createDemoClient } = await import("@/lib/supabase/demo-client");
  const { DEMO_USER_ID } = await import("@/lib/supabase/demo-seed");
  const checklist = await import("@/app/checklist/actions");
  const relocations = await import("@/app/relocations/actions");
  const { getChecklistItems } = await import("@/lib/data/checklist-db");
  const db = createDemoClient();
  const phase = async (category: string) =>
    (await getChecklistItems()).filter((i) => i.category === category).sort((a, b) => a.order_index - b.order_index);
  const add = async (title: string) =>
    ok(await checklist.createChecklistItem({ category: "post-move", title, description: null, due_date: null })).id;

  // ---- a delete leaves no hole, and the next drag down sticks ----
  for (const row of await phase("post-move")) ok(await checklist.deleteChecklistItem(row.id));
  const [a, b, c, d] = [await add("A"), await add("B"), await add("C"), await add("D")];
  ok(await checklist.deleteChecklistItem(b));
  assert.deepEqual((await phase("post-move")).map((i) => [i.title, i.order_index]), [["A", 0], ["C", 1], ["D", 2]]);
  ok(await checklist.reorderChecklistItem({ id: c, targetCategory: "post-move", targetIndex: 2 }));
  assert.deepEqual((await phase("post-move")).map((i) => i.title), ["A", "D", "C"]);

  // ---- moving a task to another phase by editing it closes the hole too ----
  ok(await checklist.updateChecklistItem(a, { category: "move-week" }));
  assert.deepEqual((await phase("post-move")).map((i) => [i.title, i.order_index]), [["D", 0], ["C", 1]]);

  // ---- lease tasks stay where the lease put them ----
  const leaseTask = (await phase("lease"))[0];
  assert.ok(leaseTask, "the demo has lease tasks");
  const leaseBefore = (await phase("lease")).map((i) => i.id);
  // The browser cannot send these, so they are built untyped here.
  const asLease = "lease" as "post-move";
  await refused(checklist.reorderChecklistItem({ id: d, targetCategory: asLease, targetIndex: 0 }));
  await refused(checklist.reorderChecklistItem({ id: leaseTask.id, targetCategory: "pre-move", targetIndex: 0 }));
  await refused(checklist.createChecklistItem({ category: asLease, title: "X", description: null, due_date: null }));
  await refused(checklist.updateChecklistItem(d, { category: asLease }));
  await refused(checklist.updateChecklistItem(leaseTask.id, { category: "pre-move" }));
  assert.deepEqual((await phase("lease")).map((i) => i.id), leaseBefore);
  assert.equal((await getChecklistItems()).find((i) => i.id === d)?.category, "post-move");

  // ---- a cleared list stays cleared ----
  for (const row of (await getChecklistItems()).filter((i) => i.category !== "lease")) {
    ok(await checklist.deleteChecklistItem(row.id));
  }
  assert.equal((await getChecklistItems()).filter((i) => i.category !== "lease").length, 0);
  assert.equal((await getChecklistItems()).filter((i) => i.category !== "lease").length, 0, "reading must not bring the template back");

  // ---- the template arrives with the first move only ----
  const move = { label: "Flow test move", origin_slug: "denver", destination_slug: "sacramento", move_date: "2027-03-01" };
  const later = await relocations.createRelocation(move);
  assert.ok(later.ok);
  assert.equal((await getChecklistItems()).filter((i) => i.category !== "lease").length, 0, "a later move must not re-seed");
  await db.from("relocations").delete().eq("user_id", DEMO_USER_ID);
  const first = await relocations.createRelocation(move);
  assert.ok(first.ok);
  const seeded = (await getChecklistItems()).filter((i) => i.category !== "lease");
  assert.ok(seeded.length > 0, "the first move seeds the template");
  assert.ok(seeded.some((i) => i.due_date !== null), "seeded tasks take their dates from the new move");

  console.log("lib/checklist/checklist-flow.test.ts passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
