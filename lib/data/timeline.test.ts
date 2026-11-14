// Script-style assertions for `aggregateTimelineEvents` + `getTimelineWindow`.
// Run via: `npx tsx lib/data/timeline.test.ts`
//
// Mirrors the `lib/lease/forecast.test.ts` pattern — no Vitest/Jest in the
// project, this is a self-contained Node script that exits non-zero on
// assertion failure.

import assert from "node:assert/strict";
import {
  aggregateTimelineEvents,
  getTimelineWindow,
  type TimelineInput,
} from "./timeline";
import type { LeaseTerms, LeaseEvent } from "@/schemas/lease";
import type { ChecklistItem } from "@/schemas";
import type {
  UtilityTransition,
  AddressChangeTarget,
} from "@/schemas/transitions";

// ---- Fixtures ---------------------------------------------------------------

const TODAY = "2027-08-20";

const lease: LeaseTerms = {
  id: "00000000-0000-0000-0000-000000000001",
  user_id: "00000000-0000-0000-0000-000000000001",
  property_name: "Juniper Court",
  unit_address: "100 Sample Street, Unit 204",
  city: "Denver, CO 80000",
  landlord_email: "landlord@example.com",
  landlord_display_name: "Landlord LLC",
  residents: [{ name: "Sam", isPrimary: true }],
  lease_start_date: "2026-10-25",
  lease_end_date: "2027-10-25",
  notice_days_required: 60,
  target_move_out_date: "2027-10-25",
  renewal_offer_expires: "2027-11-12",
  current_monthly_rent: 1800,
  renewal_monthly_rent: 1750,
  m2m_premium: 400,
  security_deposit: 1800,
  pet_rent_monthly: 0,
  parking_monthly: 0,
  included_utilities: [],
  late_fee_rules: null,
  decision: "vacate",
  origin_lat: 39.7392,
  origin_lng: -104.9903,
  created_at: "2026-07-22T00:00:00+00:00",
  updated_at: "2026-07-22T00:00:00+00:00",
};

const leaseEvents: LeaseEvent[] = [
  {
    id: "00000000-0000-0000-0000-000000000010",
    user_id: lease.user_id,
    lease_id: lease.id,
    kind: "notice_send_by",
    occurs_on: "2027-08-26",
    status: "active",
    notes: null,
    created_at: "2026-07-22T00:00:00+00:00",
  },
  {
    id: "00000000-0000-0000-0000-000000000011",
    user_id: lease.user_id,
    lease_id: lease.id,
    kind: "notice_sent",
    occurs_on: "2027-08-24",
    status: "done",
    notes: null,
    created_at: "2027-08-24T00:00:00+00:00",
  },
];

const checklist: ChecklistItem[] = [
  {
    id: "00000000-0000-0000-0000-000000000020",
    user_id: lease.user_id,
    category: "pre-move",
    title: "Reserve moving truck",
    description: null,
    due_date: "2027-09-27",
    completed: false,
    completed_at: null,
    order_index: 0,
    created_at: "2026-07-22T00:00:00+00:00",
    updated_at: "2026-07-22T00:00:00+00:00",
  },
  {
    id: "00000000-0000-0000-0000-000000000021",
    user_id: lease.user_id,
    category: "pre-move",
    title: "Sort kitchen",
    description: null,
    due_date: "2027-08-02",
    completed: false,
    completed_at: null,
    order_index: 1,
    created_at: "2026-07-22T00:00:00+00:00",
    updated_at: "2026-07-22T00:00:00+00:00",
  },
  {
    id: "00000000-0000-0000-0000-000000000022",
    user_id: lease.user_id,
    category: "post-move",
    title: "Update CA tax residency",
    description: null,
    due_date: "2027-11-13",
    completed: true,
    completed_at: "2026-11-14T00:00:00+00:00",
    order_index: 0,
    created_at: "2026-07-22T00:00:00+00:00",
    updated_at: "2026-07-22T00:00:00+00:00",
  },
];

const utilities: UtilityTransition[] = [
  {
    id: "00000000-0000-0000-0000-000000000030",
    user_id: lease.user_id,
    kind: "electricity",
    side: "origin",
    custom_label: null,
    provider: "City Power",
    account_number: null,
    login_url: null,
    phone: null,
    notes: null,
    scheduled_date: "2027-10-26",
    status: "scheduled",
    confirmed_at: null,
    order_index: 0,
    created_at: "2026-07-22T00:00:00+00:00",
    updated_at: "2026-07-22T00:00:00+00:00",
  },
  {
    id: "00000000-0000-0000-0000-000000000031",
    user_id: lease.user_id,
    kind: "internet",
    side: "destination",
    custom_label: null,
    provider: "Example ISP",
    account_number: null,
    login_url: null,
    phone: null,
    notes: null,
    scheduled_date: "2027-08-07",
    status: "scheduled",
    confirmed_at: null,
    order_index: 1,
    created_at: "2026-07-22T00:00:00+00:00",
    updated_at: "2026-07-22T00:00:00+00:00",
  },
  {
    id: "00000000-0000-0000-0000-000000000032",
    user_id: lease.user_id,
    kind: "water",
    side: "origin",
    custom_label: null,
    provider: null,
    account_number: null,
    login_url: null,
    phone: null,
    notes: null,
    scheduled_date: "2027-10-26",
    status: "skipped",
    confirmed_at: null,
    order_index: 2,
    created_at: "2026-07-22T00:00:00+00:00",
    updated_at: "2026-07-22T00:00:00+00:00",
  },
];

const addressTargets: AddressChangeTarget[] = [
  {
    id: "00000000-0000-0000-0000-000000000040",
    user_id: lease.user_id,
    kind: "usps",
    name: "USPS forward",
    due_date: "2027-10-11",
    channel: "online",
    reference_number: null,
    status: "needs_action",
    submitted_at: null,
    confirmed_at: null,
    notes: null,
    order_index: 0,
    created_at: "2026-07-22T00:00:00+00:00",
    updated_at: "2026-07-22T00:00:00+00:00",
  },
  {
    id: "00000000-0000-0000-0000-000000000041",
    user_id: lease.user_id,
    kind: "bank",
    name: "Example Bank",
    due_date: "2027-07-28",
    channel: "online",
    reference_number: null,
    status: "needs_action",
    submitted_at: null,
    confirmed_at: null,
    notes: null,
    order_index: 1,
    created_at: "2026-07-22T00:00:00+00:00",
    updated_at: "2026-07-22T00:00:00+00:00",
  },
];

const baseInput: TimelineInput = {
  lease,
  leaseEvents,
  checklist,
  utilities,
  addressTargets,
  today: TODAY,
};

// ---- Cases ------------------------------------------------------------------

// 1. Empty inputs → empty array.
{
  const out = aggregateTimelineEvents({
    lease: null,
    leaseEvents: [],
    checklist: [],
    utilities: [],
    addressTargets: [],
    today: TODAY,
  });
  assert.deepEqual(out, [], "empty inputs yield empty timeline");
}

// 2. Lease only → 2 synthetic events (lease_end + target_move_out).
{
  const out = aggregateTimelineEvents({
    lease,
    leaseEvents: [],
    checklist: [],
    utilities: [],
    addressTargets: [],
    today: TODAY,
  });
  assert.equal(out.length, 2, "lease-only yields 2 events");
  assert.equal(out[0].kind, "lease_end", "lease_end first (same date, lower source order)");
  assert.equal(out[0].label, "Lease ends", "lease_end label is friendly English");
  assert.equal(out[0].tone, "info");
  assert.equal(out[1].kind, "target_move_out", "target_move_out second");
  assert.equal(out[1].label, "Move day", "target_move_out renders as Move day");
  assert.equal(out[1].tone, "warn");
}

// 3. Full fixture: all sources represented, sorted ascending, tones correct.
{
  const out = aggregateTimelineEvents(baseInput);

  // Expected events: 2 lease + 2 leaseEvents + 3 checklist + 2 utilities (water skipped) + 2 address = 11
  assert.equal(out.length, 11, "full fixture yields 11 events");

  // Sort order check — first event should be the earliest date (Example Bank 2027-07-28).
  assert.equal(out[0].at, "2027-07-28", "earliest event sorts first");
  assert.equal(out[0].source, "address");
  assert.equal(out[out.length - 1].at, "2027-11-13", "latest event sorts last");

  // No skipped utility row.
  const water = out.find((e) => e.label.startsWith("Water"));
  assert.equal(water, undefined, "skipped utility excluded");

  // Overdue checklist (Sort kitchen, due 2027-08-02, today 2027-08-20, not completed) → danger.
  const sortKitchen = out.find((e) => e.label === "Sort kitchen");
  assert.ok(sortKitchen, "Sort kitchen event present");
  assert.equal(sortKitchen!.tone, "danger", "overdue uncompleted checklist → danger");

  // Future uncompleted checklist (Reserve moving truck, due 2027-09-27) → neutral.
  const truck = out.find((e) => e.label === "Reserve moving truck");
  assert.equal(truck?.tone, "neutral", "future uncompleted checklist → neutral");

  // Completed checklist (Update CA tax residency) → ok.
  const tax = out.find((e) => e.label === "Update CA tax residency");
  assert.equal(tax?.tone, "ok", "completed checklist → ok");

  // notice_sent (status: done) → ok.
  const sent = out.find((e) => e.kind === "notice_sent");
  assert.equal(sent?.tone, "ok", "lease_event status=done → ok");
  assert.equal(sent?.label, "Notice sent");

  // notice_send_by with the notice already sent → ok: the deadline is settled.
  const sendBy = out.find((e) => e.kind === "notice_send_by");
  assert.equal(sendBy?.tone, "ok", "notice_send_by once notice is sent → ok");
  assert.equal(sendBy?.label, "Notice send-by");

  // Overdue uncompleted address target (Example Bank, due 2027-07-28) → danger.
  const bank = out.find((e) => e.label === "Example Bank address update");
  assert.equal(bank?.tone, "danger", "overdue address → danger");

  // Overdue uncompleted utility (Internet destination, due 2027-08-07) → danger.
  const internet = out.find((e) => e.label === "Internet turn-on");
  assert.equal(internet?.tone, "danger", "overdue utility → danger");

  // Future utility scheduled but not confirmed → info.
  const elec = out.find((e) => e.label === "Electricity shut-off");
  assert.equal(elec?.tone, "info", "future scheduled utility → info");

  // Sanity: no kind starts with snake_case in user-facing label, no underscores.
  for (const e of out) {
    assert.ok(!/_/.test(e.label), `label "${e.label}" must not contain underscores`);
  }
}

// 4. Custom utility uses custom_label.
{
  const customUtil: UtilityTransition = {
    ...utilities[0],
    id: "00000000-0000-0000-0000-000000000099",
    kind: "custom",
    custom_label: "Pool service",
  };
  const out = aggregateTimelineEvents({
    ...baseInput,
    utilities: [customUtil],
  });
  const pool = out.find((e) => e.label === "Pool service shut-off");
  assert.ok(pool, "custom utility uses custom_label in friendly form");
}

// 5. getTimelineWindow basics.
{
  const empty = getTimelineWindow([], "2027-08-20");
  assert.equal(empty.start, "2027-08-20", "empty window starts today");
  assert.equal(empty.end, "2027-09-19", "empty window ends today + 30 days");

  const full = aggregateTimelineEvents(baseInput);
  const win = getTimelineWindow(full, TODAY);
  assert.equal(win.start, "2027-07-28", "window starts at earliest event when before today");
  assert.equal(win.end, "2027-11-13", "window ends at latest event when after today + 30");
}

// 6. Post-move archival (AD-039): once today is past the move date, dated
//    items that never got done render as neutral history, not danger.
{
  const POST_MOVE_TODAY = "2027-11-01";
  const out = aggregateTimelineEvents({
    ...baseInput,
    today: POST_MOVE_TODAY,
    moveDate: "2027-10-27",
  });

  const sortKitchen = out.find((e) => e.label === "Sort kitchen");
  assert.equal(sortKitchen?.tone, "neutral", "post-move overdue checklist archives to neutral");

  const bank = out.find((e) => e.label === "Example Bank address update");
  assert.equal(bank?.tone, "neutral", "post-move overdue address archives to neutral");

  const internet = out.find((e) => e.label === "Internet turn-on");
  assert.equal(internet?.tone, "neutral", "post-move overdue utility archives to neutral");

  const tax = out.find((e) => e.label === "Update CA tax residency");
  assert.equal(tax?.tone, "ok", "completed items stay ok post-move");

  // Pre-move (or no moveDate) behavior is unchanged.
  const pre = aggregateTimelineEvents({ ...baseInput, moveDate: "2027-10-27" });
  const preKitchen = pre.find((e) => e.label === "Sort kitchen");
  assert.equal(preKitchen?.tone, "danger", "pre-move overdue stays danger");

  const noDate = aggregateTimelineEvents({ ...baseInput, today: POST_MOVE_TODAY, moveDate: null });
  const noDateKitchen = noDate.find((e) => e.label === "Sort kitchen");
  assert.equal(noDateKitchen?.tone, "danger", "no move date → no archival");
}

// 7. Post-move window brackets the move instead of pinning to ancient history.
{
  const POST_MOVE_TODAY = "2027-11-01";
  const full = aggregateTimelineEvents({
    ...baseInput,
    today: POST_MOVE_TODAY,
    moveDate: "2027-10-27",
  });
  const win = getTimelineWindow(full, POST_MOVE_TODAY, "2027-10-27");
  assert.equal(win.start, "2027-09-27", "post-move window starts 30 days before the move");
  assert.equal(win.end, "2027-12-01", "post-move window still runs to today + 30");

  // Pre-move: the moveDate argument changes nothing.
  const preWin = getTimelineWindow(aggregateTimelineEvents(baseInput), TODAY, "2027-10-27");
  assert.equal(preWin.start, "2027-07-28", "pre-move window unchanged with moveDate provided");
}

// A decision deadline is stored as pending for good, so its tone follows the
// date: amber while it is ahead, red once it has passed with no notice sent,
// neutral history after the move, green once the notice is out.
{
  const pending = (kind: LeaseEvent["kind"], occurs_on: string): LeaseEvent => ({
    ...leaseEvents[0],
    kind,
    occurs_on,
    status: "pending",
  });
  const tones = (events: LeaseEvent[], today: string, moveDate: string | null = null) =>
    aggregateTimelineEvents({ ...baseInput, lease: null, checklist: [], utilities: [], addressTargets: [], leaseEvents: events, today, moveDate })
      .map((e) => e.tone);

  const deadlines = [pending("notice_send_by", "2027-09-01"), pending("renewal_offer_expires", "2027-09-01")];
  assert.deepEqual(tones(deadlines, "2027-08-20"), ["warn", "warn"], "upcoming deadline → warn");
  assert.deepEqual(tones(deadlines, "2027-09-01"), ["warn", "warn"], "deadline day itself is not overdue");
  assert.deepEqual(tones(deadlines, "2027-09-20"), ["danger", "danger"], "missed deadline, no notice sent → danger");
  assert.deepEqual(tones(deadlines, "2027-11-20", "2027-10-27"), ["neutral", "neutral"], "after the move it is history");
  assert.deepEqual(
    tones([...deadlines, { ...leaseEvents[1], occurs_on: "2027-09-05" }], "2027-09-20"),
    ["ok", "ok", "ok"],
    "notice sent → settled",
  );
  assert.deepEqual(tones([pending("lease_end", "2027-09-01")], "2027-09-20"), ["info"], "other lease events keep their tone");
}

// The window is date arithmetic on ISO days: 30 days is 30 days in every zone,
// including across the spring clock change.
assert.deepEqual(getTimelineWindow([], "2027-03-01"), { start: "2027-03-01", end: "2027-03-31" });
assert.deepEqual(getTimelineWindow([], "2027-10-20"), { start: "2027-10-20", end: "2027-11-19" });
{
  const early = aggregateTimelineEvents({ ...baseInput, today: "2027-03-01" });
  assert.equal(getTimelineWindow(early.slice(0, 1), "2027-03-01").end, early[0].at > "2027-03-31" ? early[0].at : "2027-03-31");
}

console.log("timeline.test.ts ✅");
