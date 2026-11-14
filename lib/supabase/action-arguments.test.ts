// Run: npx tsx --conditions=react-server lib/supabase/action-arguments.test.ts
//
// A server action is an address anyone can post to, and the argument types are
// gone by the time it runs. This test calls every exported action with a
// number, an array, an object and a loose string where an id or a field
// belongs. Each call must answer with a plain sentence, without throwing and
// without sending a single request to the database.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Module, { createRequire } from "node:module";
import { join } from "node:path";

const API = "http://127.0.0.1:54321";
delete process.env.RELOCA_DEMO_MODE;
Object.assign(process.env, {
  RELOCA_MODE: "private",
  RELOCA_ACCESS_GATE: "local-only",
  SUPABASE_URL: API,
  SUPABASE_SERVICE_ROLE_KEY: `service-${"x".repeat(12)}`,
  RELOCA_SINGLE_USER_ID: randomUUID(),
});

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

// Nothing leaves the process, and anything that tries is counted. The answer
// is worded the way Postgres words a refusal, so a leak of it would show.
let requests = 0;
globalThis.fetch = async () => {
  requests += 1;
  return Response.json(
    { code: "23514", message: 'new row for relation "checklist_items" violates check constraint "order_index_check"' },
    { status: 400 },
  );
};
// A refused call may log. Its text is checked through the answer instead.
console.error = () => {};

const id = randomUUID();
/** Shapes a browser never sends where a single id or word belongs. */
const WRONG: unknown[] = [7, [id], { id }, "not-an-id", null, undefined];
const DATABASE_WORDING = /[a-z]_[a-z]|\b(?:row|column|constraint|relation|uuid|expected|received|invalid input)\b/i;

let calls = 0;
async function refuses(name: string, call: (wrong: never) => Promise<unknown>, wrong: unknown[] = WRONG) {
  for (const value of wrong) {
    const label = `${name}(${JSON.stringify(value) ?? "undefined"})`;
    requests = 0;
    let answer: unknown;
    try {
      answer = await call(value as never);
    } catch (err) {
      assert.fail(`${label} threw instead of answering: ${err instanceof Error ? err.message : err}`);
    }
    assert.equal(requests, 0, `${label} reached the database`);
    const { ok, error } = answer as { ok?: boolean; error?: string };
    assert.equal(ok, false, `${label} was not refused`);
    assert.equal(typeof error, "string", `${label} gave no sentence`);
    assert.doesNotMatch(error!, DATABASE_WORDING, `${label} answered in developer wording: ${error}`);
    calls += 1;
  }
}

async function main() {
  const checklist = await import("@/app/checklist/actions");
  const lease = await import("@/app/lease/actions");
  const moveOut = await import("@/app/lease/move-out-actions");
  const movingCost = await import("@/app/moving-cost/actions");
  const properties = await import("@/app/properties/actions");
  const relocations = await import("@/app/relocations/actions");
  const transitions = await import("@/app/transitions/actions");

  // Every exported action must appear below. A new one fails here until it does.
  const covered = new Set<string>();
  const of = <M extends object>(file: string, mod: M) =>
    new Proxy(mod, {
      get(target, key: string) {
        covered.add(`${file}:${key}`);
        return target[key as keyof M];
      },
    });
  const c = of("checklist", checklist);
  const l = of("lease", lease);
  const m = of("move-out", moveOut);
  const mc = of("moving-cost", movingCost);
  const p = of("properties", properties);
  const r = of("relocations", relocations);
  const t = of("transitions", transitions);

  // ---- checklist ----
  await refuses("toggleChecklistItem", (x) => c.toggleChecklistItem({ id: x, completed: true }));
  await refuses("toggleChecklistItem input", (x) => c.toggleChecklistItem(x));
  await refuses("createChecklistItem", (x) => c.createChecklistItem(x));
  await refuses("createChecklistItem title", (x) =>
    c.createChecklistItem({ category: "pre-move", title: x, description: null, due_date: null }),
    [7, ["A"], { a: 1 }, "", "n".repeat(201), null],
  );
  await refuses("updateChecklistItem", (x) => c.updateChecklistItem(x, { title: "A" }));
  await refuses("deleteChecklistItem", (x) => c.deleteChecklistItem(x));
  await refuses("reorderChecklistItem", (x) => c.reorderChecklistItem({ id: x, targetCategory: "pre-move", targetIndex: 0 }));

  // ---- lease ----
  const notice = {
    body_markdown: "Notice",
    body_plaintext: "Notice",
    subject_line: "Notice",
    recipient_email: ["leasing", "example.test"].join("@"),
    move_out_date: "2027-01-31",
  };
  await refuses("createLeaseTerms", (x) => l.createLeaseTerms(x));
  await refuses("updateLeaseTerms", (x) => l.updateLeaseTerms(x, { notice_days_required: 30 }));
  await refuses("updateLeaseDecision", (x) => l.updateLeaseDecision(x, "vacate"));
  await refuses("updateLeaseDecision decision", (x) => l.updateLeaseDecision(id, x), [7, [id], { id }, "not-a-decision"]);
  await refuses("recomputeLeaseEvents", (x) => l.recomputeLeaseEvents(x));
  await refuses("createNoticeDraft", (x) => l.createNoticeDraft(x, notice));
  await refuses("createNoticeDraft date", (x) => l.createNoticeDraft(id, { ...notice, move_out_date: x }), [
    ["2027-01-31"],
    "2027-02-31",
  ]);
  await refuses("updateNoticeDraft", (x) => l.updateNoticeDraft(x, { subject_line: "Notice" }));
  await refuses("markNoticeSent", (x) => l.markNoticeSent(x));
  await refuses("seedLeaseChecklistTasks", (x) => l.seedLeaseChecklistTasks(x));
  await refuses("addInsurancePolicy", (x) => l.addInsurancePolicy(x));
  await refuses("updateInsurancePolicy", (x) => l.updateInsurancePolicy(x, { carrier: "Test Mutual" }));
  await refuses("deleteInsurancePolicy", (x) => l.deleteInsurancePolicy(x));
  await refuses("createDestination", (x) => l.createDestination(x));
  await refuses("setActiveDestination", (x) => l.setActiveDestination(x));
  await refuses("updateDestination", (x) => l.updateDestination(x, { city: "Elsewhere" }));
  await refuses("deleteDestination", (x) => l.deleteDestination(x));
  // Links that are not web links are refused wherever one can be saved.
  const notWebLinks = ["javascript:alert(document.domain)", "data:text/html,<p>x</p>", "file:///etc/passwd", "vbscript:x"];
  await refuses("updateDestination link", (x) => l.updateDestination(id, { source_url: x }), notWebLinks);
  await refuses("updateInsurancePolicy link", (x) => l.updateInsurancePolicy(id, { document_url: x }), notWebLinks);
  await refuses("updateUtilityTransition link", (x) => t.updateUtilityTransition(id, { login_url: x }), notWebLinks);
  for (const wrong of [7, [id], { id }, null, undefined]) {
    requests = 0;
    const preview = await l.fetchDestinationPreview(wrong as never);
    assert.equal(preview.status, "fetch_failed");
    assert.equal(requests, 0);
  }

  // ---- move-out walkthrough ----
  await refuses("addRoom", (x) => m.addRoom(x, "Balcony"));
  await refuses("addRoom name", (x) => m.addRoom(id, x), [7, ["Balcony"], { name: "Balcony" }, "", null, undefined]);
  await refuses("updateRoomRecord", (x) => m.updateRoomRecord(x, { notes: "Clean" }));
  await refuses("deleteRoom", (x) => m.deleteRoom(x));
  await refuses("updateWalkthrough", (x) => m.updateWalkthrough(x, { overall_notes: "Done" }));
  await refuses("updateWalkthrough date", (x) => m.updateWalkthrough(id, { walkthrough_date: x }), [["2027-01-31"], "2027-02-31"]);
  await refuses("markPdfGenerated", (x) => m.markPdfGenerated(x));
  await refuses("generateWalkthroughReport", (x) => m.generateWalkthroughReport(x));
  // No arguments to get wrong.
  void m.createWalkthrough;

  // ---- moving cost ----
  await refuses("upsertMoveEstimate", (x) => mc.upsertMoveEstimate(x), [7, [id], "not-an-estimate", { user_id: id }]);
  await refuses("selectScenario", (x) => mc.selectScenario(x), [7, [id], { id }, "", null, undefined]);
  await refuses("updateScenarioLineItems", (x) => mc.updateScenarioLineItems(x, []), [7, [id], { id }, "", null, undefined]);

  // ---- saved neighborhoods ----
  const notAName = [7, ["Midtown"], { name: "Midtown" }, "", "n".repeat(101), null, undefined];
  await refuses("saveNeighborhood", (x) => p.saveNeighborhood(x, "Sacramento"), notAName);
  await refuses("saveNeighborhood city", (x) => p.saveNeighborhood("Midtown", x), notAName);
  await refuses("unsaveNeighborhood", (x) => p.unsaveNeighborhood(x));

  // ---- relocations ----
  const move = { label: "Test move", origin_slug: "denver", destination_slug: "sacramento", move_date: "2027-03-01" };
  // 2027-02-31 has the shape of a date and is not one.
  const notADate = [7, ["2027-03-01"], { date: "2027-03-01" }, "2027-3-1", "2027-02-31", "2027-02-30", undefined];
  await refuses("createRelocation", (x) => r.createRelocation(x));
  await refuses("createRelocation label", (x) => r.createRelocation({ ...move, label: x }), [7, ["A"], { a: 1 }, " ", "n".repeat(101), null]);
  await refuses("createRelocation city", (x) => r.createRelocation({ ...move, origin_slug: x }), [7, ["denver"], { a: 1 }, "nowhere", null]);
  await refuses("createRelocation date", (x) => r.createRelocation({ ...move, move_date: x }), notADate);
  await refuses("updateRelocation", (x) => r.updateRelocation(x, move));
  await refuses("updateRelocation date", (x) => r.updateRelocation(id, { ...move, move_date: x }), notADate);
  await refuses("deleteRelocation", (x) => r.deleteRelocation(x));
  await refuses("updateActiveMoveDate", (x) => r.updateActiveMoveDate(x), notADate);
  await refuses("setActiveMove", (x) => r.setActiveMove(x));
  for (const wrong of [7, [id], { id }, "not-an-id"]) {
    await r.setViewingRelocation(wrong as never);
    assert.equal(cookieJar.size, 0, "only an id is kept as the viewed relocation");
  }

  // ---- transitions ----
  await refuses("createUtilityTransition", (x) => t.createUtilityTransition(x, "origin"));
  await refuses("createUtilityTransition side", (x) => t.createUtilityTransition("gas", x));
  await refuses("updateUtilityTransition", (x) => t.updateUtilityTransition(x, { provider: "Test Power" }));
  await refuses("deleteUtilityTransition", (x) => t.deleteUtilityTransition(x));
  await refuses("createAddressTarget", (x) => t.createAddressTarget(x, "Bank"));
  await refuses("createAddressTarget name", (x) => t.createAddressTarget("bank", x), [7, ["Bank"], { a: 1 }, "", null, undefined]);
  await refuses("updateAddressTarget", (x) => t.updateAddressTarget(x, { name: "Bank" }));
  await refuses("deleteAddressTarget", (x) => t.deleteAddressTarget(x));

  // ---- the database refuses: a valid call still ends in one plain sentence ----
  const down: [string, () => Promise<{ ok: boolean; error?: string }>][] = [
    ["toggleChecklistItem", () => c.toggleChecklistItem({ id, completed: true })],
    ["createChecklistItem", () => c.createChecklistItem({ category: "pre-move", title: "A", description: null, due_date: null })],
    ["updateChecklistItem", () => c.updateChecklistItem(id, { category: "move-week" })],
    ["deleteChecklistItem", () => c.deleteChecklistItem(id)],
    ["reorderChecklistItem", () => c.reorderChecklistItem({ id, targetCategory: "pre-move", targetIndex: 0 })],
    ["updateLeaseTerms", () => l.updateLeaseTerms(id, { notice_days_required: 30 })],
    ["createNoticeDraft", () => l.createNoticeDraft(id, notice)],
    ["markNoticeSent", () => l.markNoticeSent(id)],
    ["deleteInsurancePolicy", () => l.deleteInsurancePolicy(id)],
    ["deleteDestination", () => l.deleteDestination(id)],
    ["createWalkthrough", () => m.createWalkthrough()],
    ["addRoom", () => m.addRoom(id, "Balcony")],
    ["deleteRoom", () => m.deleteRoom(id)],
    ["generateWalkthroughReport", () => m.generateWalkthroughReport(id)],
  ];
  for (const [name, call] of down) {
    requests = 0;
    const answer = await call().catch((err) => assert.fail(`${name} threw when the database refused: ${err}`));
    assert.ok(requests > 0, `${name} never asked the database`);
    assert.equal(answer.ok, false, `${name} reported success after a refusal`);
    assert.doesNotMatch(answer.error ?? "", DATABASE_WORDING, `${name}: ${answer.error}`);
    assert.doesNotMatch(answer.error ?? "", new RegExp(name), "the sentence does not name the action");
  }

  const exported = Object.entries({ checklist, lease, "move-out": moveOut, "moving-cost": movingCost, properties, relocations, transitions })
    .flatMap(([file, mod]) => Object.keys(mod).filter((key) => typeof mod[key as keyof typeof mod] === "function").map((key) => `${file}:${key}`));
  assert.deepEqual(exported.filter((name) => !covered.has(name)), [], "every exported action is called here");

  console.log(`lib/supabase/action-arguments.test.ts passed (${exported.length} actions, ${calls} refused calls)`);
}

main().catch((err) => {
  console.log(err);
  process.exit(1);
});
