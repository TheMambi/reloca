// Run: npx tsx --conditions=react-server lib/lease/lease-flow.test.ts
//
// The real server actions against the in-memory demo database: a lease edit
// and a move-date change must carry through to every date derived from them.
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

// Rows of the demo database are untyped; the assertions below read them freely.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

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
  const lease = await import("@/app/lease/actions");
  const relocations = await import("@/app/relocations/actions");
  const transitions = await import("@/app/transitions/actions");
  const { renderNoticeTemplate } = await import("@/components/lease/notice-template");
  const db = createDemoClient();
  const rows = async (table: string): Promise<Row[]> =>
    ((await db.from(table).select("*").eq("user_id", DEMO_USER_ID)).data ?? []) as Row[];
  const leaseTasks = async () =>
    (await rows("checklist_items"))
      .filter((r) => r.category === "lease")
      .sort((a, b) => a.order_index - b.order_index);
  const events = async (leaseId: string) =>
    Object.fromEntries((await rows("lease_events")).filter((e) => e.lease_id === leaseId).map((e) => [e.kind, e.occurs_on]));
  // The demo keeps at most 100 rows per table. Filling a table makes the next
  // insert fail, which stands in for a database error between two writes.
  const fill = async (table: string, row: Row) => {
    const room = 100 - (((await db.from(table).select("id")).data ?? []) as Row[]).length;
    const filler = "99999999-9999-4999-8999-999999999999";
    await db.from(table).insert(Array.from({ length: room }, () => ({ ...row, user_id: filler })));
    return () => db.from(table).delete().eq("user_id", filler);
  };

  const input = {
    property_name: "Juniper Court",
    unit_address: "100 Sample Street, Unit 204",
    city: "Denver, CO 80000",
    landlord_email: ["leasing", "example.test"].join("@"),
    landlord_display_name: null,
    residents: [{ name: "Sam Rivera", isPrimary: true }],
    lease_start_date: "2026-11-01",
    lease_end_date: "2027-10-31",
    notice_days_required: 60,
    target_move_out_date: null,
    renewal_offer_expires: null,
    current_monthly_rent: 2000,
    renewal_monthly_rent: null,
    security_deposit: null,
    late_fee_rules: null,
  };

  // ---- a lease edit moves all seven task dates ----
  await db.from("checklist_items").delete().eq("user_id", DEMO_USER_ID).eq("category", "lease");
  await db.from("lease_terms").delete().eq("user_id", DEMO_USER_ID);
  await db.from("lease_events").delete().eq("user_id", DEMO_USER_ID);
  await db.from("notice_drafts").delete().eq("user_id", DEMO_USER_ID);

  const { id } = ok(await lease.createLeaseTerms(input));
  let tasks = await leaseTasks();
  assert.equal(tasks.length, 7);
  assert.equal(tasks[0].title, "Send 60-day notice to vacate");
  assert.deepEqual(
    tasks.map((t) => t.due_date),
    ["2027-09-01", "2027-10-17", "2027-10-24", "2027-11-07", "2027-10-28", "2027-10-31", "2027-12-30"],
  );

  ok(await lease.updateLeaseTerms(id, {
    lease_end_date: "2027-11-30",
    target_move_out_date: "2027-11-15",
    notice_days_required: 30,
  }));
  tasks = await leaseTasks();
  assert.equal(tasks[0].title, "Send 30-day notice to vacate", "the task title follows the notice period");
  assert.equal(tasks[0].due_date, "2027-10-31", "the notice task follows the lease");
  assert.equal(tasks[5].due_date, "2027-11-15", "key return follows the target move-out date");
  assert.deepEqual(
    tasks.map((t) => t.due_date),
    ["2027-10-31", "2027-11-16", "2027-11-08", "2027-11-22", "2027-11-12", "2027-11-15", "2028-01-14"],
    "all seven task dates moved",
  );
  assert.deepEqual(await events(id), {
    notice_send_by: "2027-10-31",
    lease_end: "2027-11-30",
    target_move_out: "2027-11-15",
    deposit_claim_window_end: "2028-01-14",
  });

  // An edit that touches no date leaves a task the user's own way alone, and a
  // row that is not one of the seven is never rewritten.
  await db.from("checklist_items").insert({ user_id: DEMO_USER_ID, category: "lease", title: "Ask about the bike room", order_index: 7 });
  ok(await lease.updateLeaseDecision(id, "vacate"));
  ok(await lease.updateLeaseTerms(id, { lease_end_date: "2027-11-30" }));
  assert.equal((await leaseTasks())[7].title, "Ask about the bike room");
  assert.equal((await leaseTasks())[7].due_date, null);

  // ---- a failed write between two steps is repaired by calling again ----
  const { row: draft } = ok(await lease.createNoticeDraft(id, {
    body_markdown: "Notice",
    body_plaintext: "Notice",
    subject_line: "Notice",
    recipient_email: input.landlord_email,
    move_out_date: "2027-11-15",
  }));
  const eventFiller = { lease_id: id, kind: "walkthrough", occurs_on: "2027-01-01", status: "pending" };
  let unfill = await fill("lease_events", eventFiller);
  await refused(lease.markNoticeSent(draft.id)); // the event insert fails
  await unfill();
  assert.ok((await rows("notice_drafts"))[0].sent_at, "the draft was already marked sent");
  ok(await lease.markNoticeSent(draft.id));
  ok(await lease.markNoticeSent(draft.id));
  const sent = (await rows("lease_events")).filter((e) => e.kind === "notice_sent");
  assert.equal(sent.length, 1, "exactly one notice-sent event after the retry");

  // A failed recompute keeps the deadlines it could not replace.
  unfill = await fill("lease_events", eventFiller);
  await refused(lease.recomputeLeaseEvents(id));
  await unfill();
  assert.equal((await events(id)).notice_send_by, "2027-10-31", "the send-by date survives a failed recompute");
  ok(await lease.recomputeLeaseEvents(id));
  assert.equal((await rows("lease_events")).filter((e) => e.kind === "notice_send_by").length, 1, "and is not duplicated after the next one");

  // A lease whose follow-up steps fail is removed again, so a retry cannot leave two.
  await db.from("checklist_items").delete().eq("user_id", DEMO_USER_ID).eq("category", "lease");
  await db.from("lease_terms").delete().eq("user_id", DEMO_USER_ID);
  unfill = await fill("lease_events", { ...eventFiller, lease_id: "88888888-8888-4888-8888-888888888888" });
  await refused(lease.createLeaseTerms(input));
  await unfill();
  assert.equal((await rows("lease_terms")).length, 0, "the half-made lease is gone");

  // ---- a 30-day California lease: 30-day letter and task, no Colorado deposit date ----
  const sacramento = { ...input, city: "Sacramento, CA 95800", notice_days_required: 30, target_move_out_date: "2027-10-31" };
  const made = ok(await lease.createLeaseTerms(sacramento));
  tasks = await leaseTasks();
  assert.equal(tasks[0].title, "Send 30-day notice to vacate");
  assert.equal(tasks[0].due_date, "2027-10-01");
  assert.equal(tasks[6].due_date, null, "no deposit date is made up for a state with no rule on file");
  assert.doesNotMatch(tasks[6].description, /Colorado|60 days/);
  assert.equal((await events(made.id)).deposit_claim_window_end, undefined, "and no deposit deadline on the timeline");
  const letter = renderNoticeTemplate(sacramento, "2027-10-31");
  assert.match(letter.subject, /^30-Day Notice to Vacate/);
  assert.doesNotMatch(letter.subject + letter.plaintext, /60-day/i);

  // ---- a move-date change carries the seeded due dates with it ----
  const active = (await rows("relocations")).find((r) => r.is_active_move)!;
  const oldMove: string = active.move_date;
  const { addDaysIso } = await import("@/lib/dates");
  const newMove = addDaysIso(oldMove, 30);
  const usps = await transitions.createAddressTarget("usps", "Mail forwarding");
  assert.ok(usps.ok);
  assert.equal(usps.row.due_date, addDaysIso(oldMove, -14));
  const moveDay = async () => (await rows("checklist_items")).find((r) => r.title.startsWith("Move day"))!;
  const handDated = (await rows("checklist_items")).find((r) => r.category === "pre-move" && r.due_date)!;
  assert.equal((await moveDay()).due_date, oldMove);

  assert.deepEqual(await relocations.updateActiveMoveDate(newMove), { ok: true, moveDate: newMove });
  assert.equal((await moveDay()).due_date, newMove, "the Move day task is due on the new date");
  assert.equal((await rows("address_change_targets")).find((r) => r.id === usps.row.id)!.due_date, addDaysIso(newMove, -14), "the mail-forwarding deadline followed");
  assert.equal((await rows("checklist_items")).find((r) => r.id === handDated.id)!.due_date, handDated.due_date, "a task with its own date stayed");
  assert.equal((await leaseTasks())[0].due_date, "2027-10-01", "lease tasks follow the lease, not the move");

  // Clearing the date clears the seeded dates. Setting one again restores them.
  await relocations.updateActiveMoveDate(null);
  assert.equal((await moveDay()).due_date, null);
  await relocations.updateRelocation(active.id, {
    label: active.label,
    origin_slug: active.origin_slug,
    destination_slug: active.destination_slug,
    move_date: oldMove,
  });
  assert.equal((await moveDay()).due_date, oldMove, "the edit dialog moves them too");

  // ---- editing a destination without changing its address keeps its pin ----
  const before = (await rows("destinations"))[0];
  assert.ok(before.lat !== null && before.lng !== null);
  await lease.updateDestination(before.id, {
    street_address: before.street_address,
    city: before.city,
    state_code: before.state_code,
    zip_code: before.zip_code,
    notes: "Viewed twice",
  });
  const after = (await rows("destinations")).find((r) => r.id === before.id)!;
  assert.deepEqual([after.lat, after.lng, after.hud_fmr_2br], [before.lat, before.lng, before.hud_fmr_2br], "coordinates and benchmark survive a same-address edit");
  assert.equal(after.notes, "Viewed twice");

  console.log("lease-flow.test.ts ✅");
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
