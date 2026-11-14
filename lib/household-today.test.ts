// Run: npx tsx --conditions=react-server lib/household-today.test.ts
//
// One "today" for the whole app. At 6 pm Pacific it is already tomorrow in UTC,
// which is where servers run. The countdown, the overdue flags and the date a
// notice is recorded as sent must all use the household's day, on the server
// and in the browser, whatever zone the process itself runs in. `pnpm test`
// runs this under TZ=UTC and TZ=America/Los_Angeles.
import assert from "node:assert/strict";
import Module, { createRequire } from "node:module";
import { join } from "node:path";

process.env.RELOCA_MODE = "demo";
process.env.NEXT_PUBLIC_RELOCA_TIME_ZONE = "America/Los_Angeles";

// 6 pm on October 24 in Los Angeles, 1 am on October 25 in UTC.
const NOW = "2027-10-25T01:00:00.000Z";
const RealDate = Date;
const frozen = new RealDate(NOW).getTime();
class FrozenDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(frozen);
    else super(...(args as [number]));
  }
  static now() {
    return frozen;
  }
}
globalThis.Date = FrozenDate as DateConstructor;

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
standIn("next/headers", { cookies: async () => ({ get: () => undefined, set() {}, delete() {} }) });
// The real module needs a browser build of React. Outside a Next render there is no signal to pass on.
standIn("next/navigation", { unstable_rethrow() {} });

async function main() {
  const dates = await import("@/lib/dates");
  const { daysUntil } = await import("@/lib/use-move-date");
  const { createDemoClient } = await import("@/lib/supabase/demo-client");
  const { DEMO_USER_ID } = await import("@/lib/supabase/demo-seed");
  const { getStatusAlerts } = await import("@/lib/data/status-alerts");
  const { getTimelineEvents } = await import("@/lib/data/timeline");
  const { getLeaseStatus, getLeaseEvents } = await import("@/lib/data/lease-db");
  const { computeTMinus } = await import("@/lib/lease/pill");
  const lease = await import("@/app/lease/actions");
  const db = createDemoClient();

  // ---- one today ----
  assert.equal(dates.HOUSEHOLD_TIME_ZONE, "America/Los_Angeles");
  assert.equal(dates.todayInZoneIso(), "2027-10-24", "today is the household's day");
  assert.equal(dates.isoDateInZone(new Date(), "UTC"), "2027-10-25", "which UTC has already left");
  assert.equal(dates.isoDateInZone(new Date("2027-03-14T09:59:00Z")), "2027-03-14", "2:59 am on the spring clock change");
  assert.equal(dates.isoDateInZone(new Date("2027-01-01T07:59:59Z")), "2026-12-31", "a second before midnight on New Year's Eve");
  assert.throws(() => dates.isoDateInZone(new Date(), "Mars/Olympus"), /NEXT_PUBLIC_RELOCA_TIME_ZONE/);

  // ---- countdown: server tiles and the top-strip editor agree ----
  const server = dates.daysUntilIso("2027-10-27");
  const client = daysUntil("2027-10-27");
  assert.equal(server, 3);
  assert.equal(client, server, "server and client count the same days");
  assert.deepEqual(dates.countdownPhrase(client), { lead: "Moving in", count: 3, trail: "days" });

  // ---- overdue flags: a task due today is not overdue this evening ----
  await db.from("checklist_items").delete().eq("user_id", DEMO_USER_ID);
  await db.from("utility_transitions").delete().eq("user_id", DEMO_USER_ID);
  await db.from("address_change_targets").delete().eq("user_id", DEMO_USER_ID);
  await db.from("checklist_items").insert([
    { user_id: DEMO_USER_ID, category: "pre-move", title: "Due today", due_date: "2027-10-24", order_index: 0 },
    { user_id: DEMO_USER_ID, category: "pre-move", title: "Due yesterday", due_date: "2027-10-23", order_index: 1 },
  ]);
  const checklistAlert = (await getStatusAlerts()).find((a) => a.id === "checklist-overdue");
  assert.equal(checklistAlert?.label, "1 task overdue", "only yesterday's task is overdue");
  const timeline = await getTimelineEvents();
  assert.equal(timeline.find((e) => e.label === "Due today")?.tone, "neutral", "due today is not red on the timeline");
  assert.equal(timeline.find((e) => e.label === "Due yesterday")?.tone, "danger");

  // ---- the notice deadline and the recorded send date ----
  await db.from("lease_terms").delete().eq("user_id", DEMO_USER_ID);
  await db.from("lease_events").delete().eq("user_id", DEMO_USER_ID);
  await db.from("notice_drafts").delete().eq("user_id", DEMO_USER_ID);
  const { id } = await lease.createLeaseTerms({
    property_name: "Juniper Court",
    unit_address: "100 Sample Street, Unit 204",
    city: "Denver, CO 80000",
    landlord_email: ["leasing", "example.test"].join("@"),
    landlord_display_name: null,
    residents: [{ name: "Sam Rivera", isPrimary: true }],
    lease_start_date: "2026-12-24",
    lease_end_date: "2027-12-23", // 60 days after October 24
    notice_days_required: 60,
    target_move_out_date: null,
    renewal_offer_expires: null,
    current_monthly_rent: 2000,
    renewal_monthly_rent: null,
    security_deposit: null,
    late_fee_rules: null,
  });
  const status = await getLeaseStatus();
  assert.equal(status.noticeSendByDate, "2027-10-24");
  assert.equal(status.daysUntilSendBy, 0, "on the evening of the deadline day the deadline is today");
  assert.deepEqual(computeTMinus(status.daysUntilSendBy, false, null, status.noticeSendByDate), { headline: "0d", sub: "TODAY" });

  const draft = await lease.createNoticeDraft(id, {
    body_markdown: "Notice",
    body_plaintext: "Notice",
    subject_line: "Notice",
    recipient_email: ["leasing", "example.test"].join("@"),
    move_out_date: "2027-12-23",
  });
  await lease.markNoticeSent(draft.id);
  const sent = (await getLeaseEvents(id)).find((e) => e.kind === "notice_sent");
  assert.equal(sent?.occurs_on, "2027-10-24", "a notice sent that evening is recorded on that day");
  assert.deepEqual(computeTMinus(null, false, sent!.occurs_on, status.noticeSendByDate), { headline: "Sent", sub: "ON TIME" });

  console.log("household-today.test.ts ✅");
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
