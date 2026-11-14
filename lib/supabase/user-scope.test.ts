// Run: npx tsx --conditions=react-server lib/supabase/user-scope.test.ts
//
// In private mode the app reaches the database with the service-role key, which
// skips row level security. Nothing in the database keeps a query inside one
// user's rows any more, so the code has to. This test runs every data loader
// and server action against a stand-in for the Supabase REST API. The stand-in
// refuses any request on a table that does not carry the user's id, and the
// test fails if it had to refuse anything.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import { join } from "node:path";
import { createDemoClient } from "./demo-client";
import { DEMO_SEED, DEMO_USER_ID } from "./demo-seed";

// The sample rows belong to this id. A second user's rows sit beside them.
const USER = DEMO_USER_ID;
const STRANGER = randomUUID();
// Stand-in values built at run time. The address is local and never contacted:
// fetch is replaced below.
const filler = (label: string) => `${label}-${"x".repeat(12)}`;
const API = "http://127.0.0.1:54321";
const SERVICE_KEY = filler("service");
const ANON_KEY = filler("anon");
const address = (name: string) => [name, "example.test"].join("@");

delete process.env.RELOCA_DEMO_MODE;
Object.assign(process.env, {
  RELOCA_MODE: "private",
  RELOCA_ACCESS_GATE: "local-only",
  SUPABASE_URL: API,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
  RELOCA_SINGLE_USER_ID: USER,
  // Deployments that have not removed it yet still carry it. Nothing may send it.
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
});

// Server actions call into Next's request machinery, which exists only inside
// a running server. Stand-ins go into the module cache before the app loads.
const appRequire = createRequire(join(process.cwd(), "package.json"));
const cookieJar = new Map<string, string>();
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
  cookies: async () => ({
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined),
    set: (name: string, value: string) => void cookieJar.set(name, value),
    delete: (name: string) => void cookieJar.delete(name),
  }),
  headers: async () => new Headers(),
});

// Every table the migrations create has to carry user_id. One that does not
// needs its own rule here and in docs/security-lockdown.md.
const migrations = join(process.cwd(), "supabase/migrations");
const tables = new Set<string>();
for (const file of readdirSync(migrations)) {
  const sql = readFileSync(join(migrations, file), "utf8");
  for (const [, name, columns] of sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*?)\n\);/g)) {
    assert.match(columns, /\n\s+user_id\s+uuid\s+NOT NULL/, `${name} has no user_id column: decide how it is scoped`);
    tables.add(name);
  }
}
assert.deepEqual([...tables].sort(), Object.keys(DEMO_SEED).sort(), "the stand-in needs rows for every table");

// ---- the stand-in ------------------------------------------------------------

type Row = Record<string, unknown>;
const db = createDemoClient();
const problems: string[] = [];
let current = "";
let requests = 0;
// Checklist rows the current call has read with the user filter.
let ownedTasks = new Set<unknown>();

const literal = (raw: string) => (raw === "true" ? true : raw === "false" ? false : raw);

async function restApi(input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> {
  const url = new URL(String(input));
  // Nothing in this test leaves the process.
  if (url.origin !== API || !url.pathname.startsWith("/rest/v1/")) return new Response(null, { status: 503 });
  requests += 1;
  const headers = new Headers(init?.headers);
  const method = init?.method ?? "GET";
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
  const target = url.pathname.slice("/rest/v1/".length);
  const refuse = (problem: string) => {
    problems.push(`${current}: ${problem} (${method} ${target}${decodeURIComponent(url.search)})`);
    return Response.json({ code: "42501", message: `user-scope test: ${problem}` }, { status: 403 });
  };

  if (headers.get("apikey") !== SERVICE_KEY || headers.get("authorization") !== `Bearer ${SERVICE_KEY}`) {
    return refuse("not sent with the service-role key");
  }

  if (target.startsWith("rpc/")) {
    if (target !== "rpc/reorder_checklist_item") return refuse("unknown function");
    // The function finds the row by id alone, so the caller must own it first.
    if (!ownedTasks.has(body.p_id)) return refuse("function called for a row not first read with the user filter");
    const { error } = await db.rpc("reorder_checklist_item", body);
    return error ? Response.json(error, { status: 400 }) : new Response(null, { status: 204 });
  }

  if (!tables.has(target)) return refuse("unknown table");
  const params = url.searchParams;
  if (method === "POST") {
    const rows: Row[] = Array.isArray(body) ? body : [body];
    if (!rows.every((row) => row?.user_id === USER)) return refuse("insert without the user's id");
  } else {
    const scope = params.getAll("user_id");
    if (scope.length !== 1 || scope[0] !== `eq.${USER}`) return refuse("no user_id filter");
    if (body && "user_id" in body) return refuse("update writes user_id");
  }

  const prefer = headers.get("prefer") ?? "";
  const select = params.get("select");
  const query = db.from(target);
  if (method === "GET" || method === "HEAD") {
    query.select(select ?? "*", { count: prefer.includes("count=") ? "exact" : undefined, head: method === "HEAD" });
  } else if (method === "POST" && prefer.includes("resolution=")) {
    query.upsert(body, {
      onConflict: params.get("on_conflict") ?? undefined,
      ignoreDuplicates: prefer.includes("ignore-duplicates"),
    });
  } else if (method === "POST") {
    query.insert(body);
  } else if (method === "PATCH") {
    query.update(body);
  } else if (method === "DELETE") {
    query.delete();
  } else {
    return refuse("method the stand-in does not understand");
  }
  if (method !== "GET" && method !== "HEAD" && select) query.select(select);

  for (const [column, expr] of params) {
    if (column === "select" || column === "columns" || column === "on_conflict") continue;
    if (column === "limit") {
      query.limit(Number(expr));
    } else if (column === "order") {
      for (const part of expr.split(",")) {
        const [name, direction, nulls] = part.split(".");
        query.order(name, { ascending: direction !== "desc", nullsFirst: nulls ? nulls === "nullsfirst" : undefined });
      }
    } else if (expr.startsWith("eq.")) {
      query.eq(column, literal(expr.slice(3)));
    } else if (expr.startsWith("neq.")) {
      query.neq(column, literal(expr.slice(4)));
    } else if (expr.startsWith("in.(") && expr.endsWith(")")) {
      query.in(column, expr.slice(4, -1).split(",").map((value) => literal(value.replace(/^"|"$/g, ""))));
    } else {
      return refuse(`filter the stand-in does not understand: ${column}=${expr}`);
    }
  }
  if (headers.get("accept")?.includes("vnd.pgrst.object")) query.single();

  const { data, error, count } = await query;
  if (error) return Response.json(error, { status: error.code === "PGRST116" ? 406 : 400 });
  const returned: Row[] = data == null ? [] : Array.isArray(data) ? data : [data as Row];
  if (returned.some((row) => "user_id" in row && row.user_id !== USER)) return refuse("returned another user's row");
  if (target === "checklist_items" && method === "GET") for (const row of returned) ownedTasks.add(row.id);
  const responseHeaders: Record<string, string> = count == null ? {} : { "content-range": `*/${count}` };
  if (data == null) return new Response(null, { status: method === "POST" ? 201 : 204, headers: responseHeaders });
  return Response.json(data, { headers: responseHeaders });
}

// ---- running the app code ----------------------------------------------------

const ran = new Set<string>();

/** Runs one loader or action. It must reach the stand-in and must not fail. */
async function run<T>(name: string, call: () => Promise<T>, mustSucceed = true): Promise<T> {
  current = name;
  requests = 0;
  ownedTasks = new Set();
  let result: T | undefined;
  try {
    result = await call();
  } catch (err) {
    // A refusal surfaces as a thrown error, and later calls then lack the row
    // an earlier one should have made. Keep going, so one run lists every
    // unscoped query.
    if (problems.length === 0) throw new Error(`${name} failed`, { cause: err });
  }
  if (problems.length === 0) {
    assert.ok(requests > 0, `${name} sent no request`);
    if (mustSucceed) assert.notEqual((result as { ok?: boolean } | undefined)?.ok, false, `${name} reported a failure`);
  }
  ran.add(name);
  return result as T;
}

async function strangerRows(): Promise<Row[]> {
  const all: Row[] = [];
  for (const table of tables) {
    const { data } = await db.from(table).select("*").eq("user_id", STRANGER).order("id");
    all.push(...(data as Row[]));
  }
  return all;
}

async function main() {
  globalThis.fetch = restApi;

  // A second user's rows in every table, as a real table could hold once the
  // database no longer filters. A missing filter would hand them to the app.
  for (const [table, rows] of Object.entries(DEMO_SEED)) {
    const copies = rows.slice(0, 2).map((row) => ({ ...row, id: randomUUID(), user_id: STRANGER }));
    if (copies.length) await db.from(table).insert(copies);
  }
  const strangerWalkthrough = randomUUID();
  await db.from("move_out_walkthroughs").insert({ id: strangerWalkthrough, user_id: STRANGER, walkthrough_date: "2026-01-01" });
  await db.from("move_out_room_records").insert({ walkthrough_id: strangerWalkthrough, user_id: STRANGER, room_name: "Kitchen" });
  const strangerBefore = await strangerRows();
  assert.ok(strangerBefore.length >= tables.size, "every table holds a row of the second user");

  const leaseDb = await import("@/lib/data/lease-db");
  const transitionsDb = await import("@/lib/data/transitions-db");
  const moveOutDb = await import("@/lib/data/move-out-db");
  const moveCostDb = await import("@/lib/data/move-cost-db");
  const checklistDb = await import("@/lib/data/checklist-db");
  const relocationDb = await import("@/lib/data/relocation-db");
  const savedDb = await import("@/lib/data/saved-neighborhoods-db");
  const overlays = await import("@/lib/lease/overlays");
  const checklist = await import("@/app/checklist/actions");
  const lease = await import("@/app/lease/actions");
  const moveOut = await import("@/app/lease/move-out-actions");
  const movingCost = await import("@/app/moving-cost/actions");
  const properties = await import("@/app/properties/actions");
  const relocations = await import("@/app/relocations/actions");
  const transitions = await import("@/app/transitions/actions");
  const { createAdminClient } = await import("./server");

  const seedLease = String(DEMO_SEED.lease_terms[0].id);
  const seedDestination = String(DEMO_SEED.destinations[0].id);
  const seedRelocation = String(DEMO_SEED.relocations.find((r) => r.is_active_move)!.id);
  const seedTask = String(DEMO_SEED.checklist_items.find((r) => r.category !== "lease")!.id);

  // ---- data loaders ----
  await run("lease-db:getActiveLease", () => leaseDb.getActiveLease());
  await run("lease-db:getLeaseEvents", () => leaseDb.getLeaseEvents(seedLease));
  await run("lease-db:getLatestNoticeDraft", () => leaseDb.getLatestNoticeDraft(seedLease));
  await run("lease-db:getDestinations", () => leaseDb.getDestinations());
  await run("lease-db:getActiveDestination", () => leaseDb.getActiveDestination());
  await run("lease-db:getInsurancePolicies", () => leaseDb.getInsurancePolicies());
  await run("lease-db:getLeaseStatus", () => leaseDb.getLeaseStatus());
  await run("transitions-db:getUtilityTransitions", () => transitionsDb.getUtilityTransitions());
  await run("transitions-db:getAddressTargets", () => transitionsDb.getAddressTargets());
  await run("move-cost-db:getMoveEstimate", () => moveCostDb.getMoveEstimate());
  await run("checklist-db:getChecklistItems", () => checklistDb.getChecklistItems());
  await run("relocation-db:getRelocations", () => relocationDb.getRelocations());
  await run("relocation-db:getActiveRelocation", () => relocationDb.getActiveRelocation());
  await run("relocation-db:getActiveMoveContext", () => relocationDb.getActiveMoveContext());
  await run("relocation-db:getViewingRelocation", () => relocationDb.getViewingRelocation(null));
  await run("saved-neighborhoods-db:getSavedNeighborhoods", () => savedDb.getSavedNeighborhoods());
  await run("overlays:recomputeDestinationOverlays", () => overlays.recomputeDestinationOverlays(seedDestination));

  // ---- checklist ----
  await run("checklist:toggleChecklistItem", () => checklist.toggleChecklistItem({ id: seedTask, completed: true }));
  const task = await run("checklist:createChecklistItem", () =>
    checklist.createChecklistItem({ category: "post-move", title: "Scope test", description: null, due_date: null }),
  );
  await run("checklist:updateChecklistItem", () => checklist.updateChecklistItem(task?.id, { category: "move-week", title: "Moved" }));
  await run("checklist:reorderChecklistItem", () =>
    checklist.reorderChecklistItem({ id: task?.id, targetCategory: "pre-move", targetIndex: 0 }),
  );
  await run("checklist:deleteChecklistItem", () => checklist.deleteChecklistItem(task?.id));
  // With no tasks left, both seeders go all the way to their inserts.
  await db.from("checklist_items").delete().eq("user_id", USER);
  await run("checklist-db:seedChecklistIfEmpty", () => checklistDb.seedChecklistIfEmpty(relocationDb.moveContextFor(null)));

  // ---- lease ----
  const newLease = await run("lease:createLeaseTerms", () =>
    lease.createLeaseTerms({
      property_name: "Scope Court",
      unit_address: "1 Test Street",
      city: "Testville",
      landlord_email: address("leasing"),
      landlord_display_name: null,
      residents: [{ name: "Test Resident", isPrimary: true }],
      lease_start_date: "2026-01-01",
      lease_end_date: "2026-12-31",
      target_move_out_date: "2026-12-31",
      renewal_offer_expires: "2026-10-01",
      current_monthly_rent: 1000,
      renewal_monthly_rent: null,
      security_deposit: null,
      late_fee_rules: null,
    }),
  );
  await db.from("checklist_items").delete().eq("user_id", USER).eq("category", "lease");
  await run("lease:seedLeaseChecklistTasks", () => lease.seedLeaseChecklistTasks(newLease?.id));
  await run("lease:recomputeLeaseEvents", () => lease.recomputeLeaseEvents(newLease?.id));
  await run("lease:updateLeaseTerms", () => lease.updateLeaseTerms(newLease?.id, { notice_days_required: 30 }));
  await run("lease:updateLeaseDecision", () => lease.updateLeaseDecision(newLease?.id, "vacate"));
  const draft = await run("lease:createNoticeDraft", () =>
    lease.createNoticeDraft(newLease?.id, {
      body_markdown: "Notice",
      body_plaintext: "Notice",
      subject_line: "Notice to vacate",
      recipient_email: address("leasing"),
      move_out_date: "2026-12-31",
    }),
  );
  await run("lease:updateNoticeDraft", () => lease.updateNoticeDraft(draft?.id, { subject_line: "Notice" }));
  await run("lease:markNoticeSent", () => lease.markNoticeSent(draft?.id));
  const policy = await run("lease:addInsurancePolicy", () =>
    lease.addInsurancePolicy({
      scope: "origin",
      property_label: "Scope Court",
      carrier: null,
      policy_number: null,
      liability_amount: 100000,
      personal_property_amount: 20000,
      monthly_cost: null,
      effective_from: "2026-01-01",
      effective_to: null,
      interested_party_name: null,
      document_url: null,
    }),
  );
  await run("lease:updateInsurancePolicy", () => lease.updateInsurancePolicy(policy?.id, { carrier: "Test Mutual" }));
  await run("lease:deleteInsurancePolicy", () => lease.deleteInsurancePolicy(policy?.id));
  const destination = await run("lease:createDestination", () =>
    lease.createDestination({
      building_name: "Scope Tower",
      street_address: "2 Test Avenue",
      city: "Testville",
      state_code: null,
      zip_code: null,
      source_url: null,
      monthly_rent_low: null,
      monthly_rent_high: null,
      application_fee: null,
      security_deposit: null,
      pet_rent_monthly: null,
      parking_monthly: null,
      beds: null,
      baths: null,
      sqft: null,
      pets_allowed: null,
      furnished: null,
      insurance_min_liability: null,
      insurance_min_property: null,
      is_active_target: true,
      notes: null,
    }),
  );
  await run("lease:setActiveDestination", () => lease.setActiveDestination(seedDestination));
  await run("lease:updateDestination", () => lease.updateDestination(destination?.id, { is_active_target: true, city: "Elsewhere" }));
  await run("lease:deleteDestination", () => lease.deleteDestination(destination?.id));

  // ---- move-out walkthrough ----
  // The user has none yet. An unscoped read would return the second user's.
  const created = await run("move-out:createWalkthrough", () => moveOut.createWalkthrough());
  await run("move-out:createWalkthrough", () => moveOut.createWalkthrough());
  const walkthrough = created?.walkthrough.id;
  await run("move-out-db:getActiveWalkthrough", () => moveOutDb.getActiveWalkthrough());
  await run("move-out-db:getRoomRecords", () => moveOutDb.getRoomRecords(walkthrough));
  await run("move-out-db:getActiveWalkthroughWithRooms", () => moveOutDb.getActiveWalkthroughWithRooms());
  const room = await run("move-out:addRoom", () => moveOut.addRoom(walkthrough, "Balcony"));
  await run("move-out:updateRoomRecord", () => moveOut.updateRoomRecord(room?.id, { notes: "Clean" }));
  await run("move-out:updateWalkthrough", () => moveOut.updateWalkthrough(walkthrough, { overall_notes: "Done" }));
  await run("move-out:markPdfGenerated", () => moveOut.markPdfGenerated(walkthrough));
  // Its three reads run before the PDF is drawn. Drawing needs Next's compiler
  // and fails here, which the action logs and reports as a failure.
  const logError = console.error;
  console.error = () => {};
  await run("move-out:generateWalkthroughReport", () => moveOut.generateWalkthroughReport(walkthrough), false);
  console.error = logError;
  await run("move-out:deleteRoom", () => moveOut.deleteRoom(room?.id));

  // ---- saved neighborhoods ----
  const saved = await run("properties:saveNeighborhood", () => properties.saveNeighborhood("Scope Heights", "Testville"));
  await run("properties:unsaveNeighborhood", () => properties.unsaveNeighborhood(saved?.ok ? saved.row.id : ""));

  // ---- relocations ----
  const move = { label: "Scope move", origin_slug: "denver", destination_slug: "sacramento", move_date: null };
  const relocation = await run("relocations:createRelocation", () => relocations.createRelocation(move));
  const relocationId = relocation?.ok ? relocation.row.id : "";
  await run("relocations:updateRelocation", () => relocations.updateRelocation(relocationId, { ...move, label: "Renamed" }));
  await run("relocations:setActiveMove", () => relocations.setActiveMove(relocationId));
  await run("relocations:updateActiveMoveDate", () => relocations.updateActiveMoveDate("2027-01-15"));
  await run("relocations:setActiveMove", () => relocations.setActiveMove(seedRelocation));
  await run("relocations:deleteRelocation", () => relocations.deleteRelocation(relocationId));

  // ---- utilities and address changes ----
  const utility = await run("transitions:createUtilityTransition", () => transitions.createUtilityTransition("gas", "origin"));
  const utilityId = utility?.ok ? utility.row.id : "";
  await run("transitions:updateUtilityTransition", () => transitions.updateUtilityTransition(utilityId, { status: "confirmed" }));
  await run("transitions:deleteUtilityTransition", () => transitions.deleteUtilityTransition(utilityId));
  const target = await run("transitions:createAddressTarget", () => transitions.createAddressTarget("bank", "Test Bank"));
  const targetId = target?.ok ? target.row.id : "";
  await run("transitions:updateAddressTarget", () => transitions.updateAddressTarget(targetId, { status: "submitted" }));
  await run("transitions:deleteAddressTarget", () => transitions.deleteAddressTarget(targetId));

  // ---- moving cost ----
  await run("moving-cost:upsertMoveEstimate", () => movingCost.upsertMoveEstimate({ distance_miles: 1000 }));
  await db.from("move_estimates").delete().eq("user_id", USER);
  await run("moving-cost:upsertMoveEstimate", () => movingCost.upsertMoveEstimate({}));
  await run("moving-cost:selectScenario", () => movingCost.selectScenario("diy"));
  await run("moving-cost:updateScenarioLineItems", () =>
    movingCost.updateScenarioLineItems("diy", [{ id: "diy-truck", name: "Truck rental", cost: 900 }]),
  );

  // ---- nothing was skipped ----
  // An export added later has to be run above, or listed here as never
  // touching the database.
  const noDatabase = new Set([
    "lease:fetchDestinationPreview", // reads a pasted link
    "relocations:setViewingRelocation", // writes a cookie
    "relocation-db:deriveMoveContext",
    "relocation-db:resolveViewingRelocation",
    "relocation-db:pickViewingId",
    "relocation-db:moveContextFor",
    "relocation-db:toRelocationOption",
    "move-cost-db:recomputeScenarioTotals",
    "move-cost-db:buildDefaultScenarios",
    "saved-neighborhoods-db:buildSavedKeySet",
    "saved-neighborhoods-db:buildSavedIdMap",
    "overlays:extractZip",
    "overlays:hudEntityForCity",
    "overlays:overlayPatch",
  ]);
  const modules: Record<string, object> = {
    "lease-db": leaseDb,
    "transitions-db": transitionsDb,
    "move-out-db": moveOutDb,
    "move-cost-db": moveCostDb,
    "checklist-db": checklistDb,
    "relocation-db": relocationDb,
    "saved-neighborhoods-db": savedDb,
    overlays,
    checklist,
    lease,
    "move-out": moveOut,
    "moving-cost": movingCost,
    properties,
    relocations,
    transitions,
  };
  for (const [prefix, exports] of Object.entries(modules)) {
    for (const [name, value] of Object.entries(exports)) {
      if (typeof value !== "function") continue;
      const id = `${prefix}:${name}`;
      assert.ok(ran.has(id) || noDatabase.has(id), `${id} is exported but this test does not run it`);
    }
  }

  // A file that starts using the database client has to be run above too.
  // The whole repo is read, so a helper in lib/supabase, a file in the root or
  // a script cannot slip past. Only lib/supabase/server.ts may load a Supabase
  // package: a client built anywhere else would not be seen by this test.
  const usesClient: string[] = [];
  const importsSupabase: string[] = [];
  const leaksDbText: string[] = [];
  const skipped = new Set(["node_modules", "Inspiration"]);
  const walk = (dir: string) => {
    for (const entry of readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
      if (skipped.has(entry.name) || entry.name.startsWith(".")) continue;
      const path = dir === "." ? entry.name : `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (/\.(tsx?|mjs|js)$/.test(path) && !path.endsWith(".test.ts") && path !== "lib/supabase/server.ts") {
        const source = readFileSync(join(process.cwd(), path), "utf8");
        if (/\bcreate(Admin)?Client\(/.test(source)) usesClient.push(path);
        if (/["']@supabase\//.test(source)) importsSupabase.push(path);
        // A database error's own text names tables and columns. Callers get friendlyDbError instead.
        if (/error:\s*`[^`]*\$\{\w+\.message\}/.test(source)) leaksDbText.push(path);
      }
    }
  };
  walk(".");
  assert.deepEqual(importsSupabase, [], "only lib/supabase/server.ts may import a Supabase package");
  assert.deepEqual(leaksDbText, [], "an action returns a database error's own text to the browser");
  assert.deepEqual(usesClient.sort(), [
    "app/checklist/actions.ts",
    "app/lease/actions.ts",
    "app/lease/move-out-actions.tsx",
    "app/moving-cost/actions.ts",
    "app/properties/actions.ts",
    "app/relocations/actions.ts",
    "app/transitions/actions.ts",
    "lib/data/checklist-db.ts",
    "lib/data/lease-db.ts",
    "lib/data/move-cost-db.ts",
    "lib/data/move-out-db.ts",
    "lib/data/relocation-db.ts",
    "lib/data/saved-neighborhoods-db.ts",
    "lib/data/transitions-db.ts",
    "lib/lease/overlays.ts",
  ]);

  // ---- the verdict ----
  assert.deepEqual(problems, [], "every request on a table must carry the user's id");
  assert.deepEqual(await strangerRows(), strangerBefore, "the second user's rows were read past or changed");

  // ---- the stand-in refuses what the app must never send ----
  // Each of these goes through the real client and has to be caught.
  const client = createAdminClient();
  const refused = async (name: string, send: () => PromiseLike<{ error: unknown }>) => {
    current = name;
    ownedTasks = new Set();
    const { error } = await send();
    assert.ok(error && problems.length === 1, `${name} was not refused`);
    problems.length = 0;
  };
  await refused("read with no filter", () => client.from("lease_terms").select("*"));
  await refused("read with another user's id", () => client.from("lease_terms").select("*").eq("user_id", STRANGER));
  await refused("update by id alone", () => client.from("lease_terms").update({ city: "Elsewhere" }).eq("id", seedLease));
  await refused("delete by id alone", () => client.from("destinations").delete().eq("id", seedDestination));
  await refused("insert for another user", () =>
    client.from("saved_neighborhoods").insert({ user_id: STRANGER, neighborhood: "Scope Heights", city: "Testville" }),
  );
  await refused("function call with no ownership read", () =>
    client.rpc("reorder_checklist_item", { p_id: seedTask, p_target_category: "post-move", p_target_index: 0 }),
  );
  assert.deepEqual(await strangerRows(), strangerBefore);

  console.log(`lib/supabase/user-scope.test.ts passed (${ran.size} loaders and actions)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
