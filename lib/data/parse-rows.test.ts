// Run: npx tsx --conditions=react-server lib/data/parse-rows.test.ts
//
// A stored row the schema rejects must stop the page with the error the error
// screen recognises, not with an anonymous failure.
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { join } from "node:path";

process.env.RELOCA_MODE = "demo";

const appRequire = createRequire(join(process.cwd(), "package.json"));
function standIn(specifier: string, exports: object) {
  const file = appRequire.resolve(specifier);
  const mod = new Module(file);
  mod.exports = exports;
  mod.loaded = true;
  appRequire.cache[file] = mod;
}
standIn("next/server", { connection: async () => {} });
standIn("next/headers", {
  cookies: async () => ({ get: () => undefined, set() {}, delete() {} }),
  headers: async () => new Headers(),
});

async function main() {
  const { createDemoClient } = await import("@/lib/supabase/demo-client");
  const { DEMO_USER_ID } = await import("@/lib/supabase/demo-seed");
  const { getChecklistItems } = await import("@/lib/data/checklist-db");
  const { DAMAGED_RECORD_DIGEST, DamagedRecordError } = await import("@/lib/data/parse-rows");

  assert.ok((await getChecklistItems()).length > 0, "the sample checklist loads");

  // The kind of row a write from outside the app could leave behind.
  const db = createDemoClient();
  const title = `private wording ${Date.now()}`;
  const { data: bad, error } = await db
    .from("checklist_items")
    .insert({ user_id: DEMO_USER_ID, category: "post-move", title, order_index: -1 })
    .select("id")
    .single();
  assert.equal(error, null);
  const badId = (bad as { id: string }).id;

  const logged: string[] = [];
  const realError = console.error;
  console.error = (...args: unknown[]) => void logged.push(args.join(" "));
  try {
    await assert.rejects(getChecklistItems(), (err: unknown) => {
      assert.ok(err instanceof DamagedRecordError);
      assert.equal(err.digest, DAMAGED_RECORD_DIGEST);
      assert.match(err.message, /checklist_items/);
      assert.match(err.message, /order_index/);
      return true;
    });
  } finally {
    console.error = realError;
    // The demo store is shared by every test in this process.
    await db.from("checklist_items").delete().eq("id", badId).eq("user_id", DEMO_USER_ID);
  }
  assert.equal(logged.length, 1, "one log line for the damaged row");
  assert.ok(logged[0].includes(badId), "the log names the row");
  assert.ok(!logged[0].includes(title), "the log leaves the row's values out");

  assert.ok((await getChecklistItems()).length > 0, "the checklist loads again once the row is gone");
  console.log("parse-rows: a damaged row raises the error the error screen recognises.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
