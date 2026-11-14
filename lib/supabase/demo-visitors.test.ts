// Run: npx tsx --conditions=react-server lib/supabase/demo-visitors.test.ts
//
// Two demo visitors never see each other's rows, and a request without a
// visitor id reads the sample data and cannot write.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Module, { createRequire } from "node:module";
import { join } from "node:path";

process.env.RELOCA_MODE = "demo";

// What the next request carries: a cookie value, none, or no request at all.
let visitor: string | undefined;
let inRequest = true;

const appRequire = createRequire(join(process.cwd(), "package.json"));
const file = appRequire.resolve("next/headers");
const mod = new Module(file);
mod.exports = {
  cookies: async () => {
    if (!inRequest) throw new Error("`cookies` was called outside a request scope.");
    return { get: (name: string) => (name === "reloca_demo_visitor" && visitor ? { name, value: visitor } : undefined) };
  },
};
mod.loaded = true;
appRequire.cache[file] = mod;

type Row = Record<string, unknown>;

async function main() {
  const { createDemoClient } = await import("@/lib/supabase/demo-client");
  const { DEMO_SEED, DEMO_USER_ID } = await import("@/lib/supabase/demo-seed");
  const { middleware, config } = await import("@/middleware");
  const { NextRequest } = await import("next/server");
  const db = createDemoClient();
  const titles = async () => ((await db.from("checklist_items").select("title")).data as Row[]).map((r) => r.title).sort();
  const add = (title: string) =>
    db.from("checklist_items").insert({ user_id: DEMO_USER_ID, category: "post-move", title, order_index: 90 });
  const seedTitles = DEMO_SEED.checklist_items.map((r) => r.title).sort();

  // ---- two visitors ----
  const anna = randomUUID();
  const ben = randomUUID();
  visitor = anna;
  assert.equal((await add("Anna's task")).error, null);
  await db.from("relocations").update({ label: "Anna's move" }).eq("user_id", DEMO_USER_ID);
  visitor = ben;
  assert.deepEqual(await titles(), seedTitles, "the second visitor sees the sample data only");
  assert.equal((await add("Ben's task")).error, null);
  assert.ok(!(await titles()).includes("Anna's task"));
  assert.ok(((await db.from("relocations").select("label")).data as Row[]).every((r) => r.label !== "Anna's move"));
  visitor = anna;
  assert.ok((await titles()).includes("Anna's task"));
  assert.ok(!(await titles()).includes("Ben's task"));

  // ---- no visitor id: reads the sample data, cannot write ----
  for (const value of [undefined, "shared", "not-an-id", `${anna} `]) {
    visitor = value;
    const label = `cookie ${JSON.stringify(value)}`;
    assert.deepEqual(await titles(), seedTitles, `${label} reads the sample data`);
    assert.ok((await add("Stranger's task")).error, `${label} cannot insert`);
    assert.ok((await db.from("checklist_items").update({ title: "Stranger's task" }).eq("user_id", DEMO_USER_ID)).error, `${label} cannot update`);
    assert.ok((await db.from("checklist_items").delete().eq("user_id", DEMO_USER_ID)).error, `${label} cannot delete`);
    const first = DEMO_SEED.checklist_items.find((r) => r.category === "pre-move")!;
    const moved = await db.rpc("reorder_checklist_item", { p_id: first.id, p_target_category: "post-move", p_target_index: 0 });
    assert.ok(moved.error, `${label} cannot reorder`);
    assert.deepEqual(await titles(), seedTitles, `${label} left the sample data alone`);
  }

  // ---- 300 writes without an id do not push a visitor's copy out ----
  // The demo keeps 200 copies and drops the one unused longest.
  visitor = undefined;
  for (let i = 0; i < 300; i++) await add(`Flood ${i}`);
  visitor = anna;
  assert.ok((await titles()).includes("Anna's task"), "the first visitor's copy is still there");

  // ---- outside a request: one shared copy for scripts and tests, none in production ----
  inRequest = false;
  assert.equal((await add("Script's task")).error, null);
  const env = process.env as Record<string, string | undefined>;
  env.NODE_ENV = "production";
  assert.ok((await add("Script's task")).error, "a production server never writes to a shared copy");
  assert.deepEqual(await titles(), seedTitles);
  delete env.NODE_ENV;
  inRequest = true;

  // ---- the middleware: which addresses it runs on ----
  // Next compiles each entry to a pattern over the whole path.
  const patterns = config.matcher.map((m) => new RegExp(`^${m.replace("/:neighborhood", "/[^/]+")}$`));
  const runsOn = (path: string) => patterns.some((p) => p.test(path));
  for (const path of ["/", "/checklist", "/x.y", "/x.html", "/lease.json", "/properties/a.b", "/properties/a.png", "/robots.txt", "/a.png/b"]) {
    assert.ok(runsOn(path), `the middleware runs on ${path}`);
  }
  for (const path of ["/_next/static/chunks/a.js", "/_next/image", "/favicon.ico", "/maplibre-gl-worker.mjs", "/Cities_Here_Sec.png", "/icon.svg"]) {
    assert.ok(!runsOn(path), `the middleware skips ${path}`);
  }

  // ---- the middleware: who gets a visitor id ----
  const given = (method: string, path: string, cookie?: string) => {
    const req = new NextRequest(new URL(path, "http://localhost"), { method, headers: cookie ? { cookie } : {} });
    const res = middleware(req);
    return { set: res.cookies.get("reloca_demo_visitor")?.value, seen: req.cookies.get("reloca_demo_visitor")?.value };
  };
  const view = given("GET", "/x.y");
  assert.match(view.set ?? "", /^[0-9a-f-]{36}$/, "a page view on a dotted address gets an id");
  assert.equal(view.seen, view.set, "and the page already runs with it");
  assert.notEqual(given("GET", "/checklist").set, view.set, "each new visitor gets a different id");
  for (const method of ["POST", "PUT", "DELETE"]) {
    const post = given(method, "/x.y");
    assert.equal(post.set, undefined, `${method} without an id is not given one`);
    assert.equal(post.seen, undefined);
    assert.equal(given(method, "/x.y", "reloca_demo_visitor=nope").seen, "nope", "a bad id is passed on and refused by the database");
  }
  const kept = given("POST", "/checklist", `reloca_demo_visitor=${anna}`);
  assert.equal(kept.set, undefined, "a visitor who has an id keeps it");
  assert.equal(kept.seen, anna);

  console.log("demo-visitors: visitors are separate and a request without an id cannot write.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
