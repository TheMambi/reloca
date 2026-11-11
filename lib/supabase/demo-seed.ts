import checklistSeed from "@/data/checklist-seed.json";

/**
 * Sample data for the public demo (RELOCA_DEMO_MODE=1). Everything here is
 * fictional. Dates are computed from the day the server starts so the demo
 * always sits mid-move: move day 45 days out, notice already sent.
 */

export const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";

const RELOCATION_ID = "00000000-0000-4000-8000-0000000000a1";
const WHAT_IF_ID = "00000000-0000-4000-8000-0000000000a2";
const LEASE_ID = "00000000-0000-4000-8000-0000000000b1";
const NOTICE_ID = "00000000-0000-4000-8000-0000000000c1";
const DESTINATION_ID = "00000000-0000-4000-8000-0000000000d1";

type Row = Record<string, unknown>;

function isoDay(offset: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

function stamp(offset: number): string {
  return `${isoDay(offset)}T16:00:00.000Z`;
}

const MOVE = 45;
const LEASE_END = MOVE - 1;
const NOTICE_DAYS = 60;

let n = 0;
function id(prefix: string): string {
  n += 1;
  return `00000000-0000-4000-8000-${prefix}${String(n).padStart(12 - prefix.length, "0")}`;
}

function base(created: number): Row {
  return { user_id: DEMO_USER_ID, created_at: stamp(created), updated_at: stamp(created) };
}

const relocations: Row[] = [
  { ...base(-60), id: RELOCATION_ID, label: "Denver to Long Beach", origin_slug: "denver", destination_slug: "long-beach", move_date: isoDay(MOVE), is_active_move: true },
  { ...base(-40), id: WHAT_IF_ID, label: "What if: Sacramento", origin_slug: "denver", destination_slug: "sacramento", move_date: isoDay(MOVE + 60), is_active_move: false },
];

const lease_terms: Row[] = [
  {
    ...base(-60),
    id: LEASE_ID,
    property_name: "Juniper Court",
    unit_address: "100 Sample Street, Unit 204",
    city: "Denver, CO 80000",
    landlord_email: "management@example.com",
    landlord_display_name: "Juniper Court Leasing",
    residents: [
      { name: "Sam Rivera", isPrimary: true },
      { name: "Alex Chen", isPrimary: false },
    ],
    lease_start_date: isoDay(LEASE_END - 365),
    lease_end_date: isoDay(LEASE_END),
    notice_days_required: NOTICE_DAYS,
    target_move_out_date: isoDay(LEASE_END),
    renewal_offer_expires: isoDay(-20),
    current_monthly_rent: 1800,
    renewal_monthly_rent: 1750,
    m2m_premium: 400,
    security_deposit: 1800,
    pet_rent_monthly: 0,
    parking_monthly: 0,
    included_utilities: ["water", "trash"],
    late_fee_rules: null,
    decision: "vacate",
    origin_lat: 39.7392,
    origin_lng: -104.9903,
  },
];

function event(kind: string, offset: number, status = "pending"): Row {
  return { id: id("e"), user_id: DEMO_USER_ID, lease_id: LEASE_ID, kind, occurs_on: isoDay(offset), status, notes: null, created_at: stamp(-60) };
}

// Same derivation as recomputeLeaseEvents in app/lease/actions.ts.
const lease_events: Row[] = [
  event("notice_send_by", LEASE_END - NOTICE_DAYS, "done"),
  event("renewal_offer_expires", -20, "done"),
  event("lease_end", LEASE_END),
  event("target_move_out", LEASE_END),
  event("deposit_claim_window_end", LEASE_END + 60),
  event("notice_sent", LEASE_END - NOTICE_DAYS - 3, "done"),
];

const noticeBody =
  "Hello Juniper Court Leasing,\n\nWe are giving our 60-day notice to vacate Unit 204, 100 Sample Street. " +
  `Our last day in the apartment will be ${isoDay(LEASE_END)}.\n\nThank you,\nSam Rivera\nAlex Chen`;

const notice_drafts: Row[] = [
  {
    id: NOTICE_ID,
    user_id: DEMO_USER_ID,
    lease_id: LEASE_ID,
    body_markdown: noticeBody,
    body_plaintext: noticeBody,
    subject_line: "60-Day Notice to Vacate, Unit 204, 100 Sample Street",
    recipient_email: "management@example.com",
    move_out_date: isoDay(LEASE_END),
    created_at: stamp(LEASE_END - NOTICE_DAYS - 4),
    sent_at: stamp(LEASE_END - NOTICE_DAYS - 3),
  },
];

function task(category: string, title: string, description: string | null, dueOffset: number | null, order: number, done = false): Row {
  return {
    ...base(-60),
    id: id("f"),
    category,
    title,
    description,
    due_date: dueOffset == null ? null : isoDay(dueOffset),
    completed: done,
    completed_at: done ? stamp(-5) : null,
    order_index: order,
  };
}

const preMove: [string, string, number, boolean][] = [
  ["Get three moving quotes", "Compare a full-service mover, a container service and a rental truck.", -10, true],
  ["Sell or donate furniture that won't fit", "Measure the new place first; list the rest a month out.", 14, false],
  ["Order boxes and packing supplies", "Book enough for kitchen and books first; they go fastest.", 20, false],
  ["Forward mail with USPS", "Start forwarding the day before the move.", MOVE - 1, false],
  ["Book an overnight stop for the drive", "The drive is about 15 hours; split it in two.", MOVE - 14, false],
];

const checklist_items: Row[] = [
  task("lease", "Send 60-day notice to vacate", "Reply to the renewal email with the last day in the apartment.", LEASE_END - NOTICE_DAYS, 0, true),
  task("lease", "Confirm origin renter's insurance to lease end", "Keep coverage active through lease end.", LEASE_END - 14, 1, true),
  task("lease", "Schedule the move-out walkthrough", "Ask for the walkthrough on or right after the last day.", LEASE_END - 7, 2),
  ...preMove.map(([title, description, due, done], i) => task("pre-move", title, description, due, i, done)),
  ...checklistSeed.map((item) =>
    task(item.category, item.title, item.description, MOVE + item.daysOffsetFromMoveDate, item.orderIndex),
  ),
];

function utility(kind: string, side: string, provider: string, status: string, scheduled: number | null, order: number): Row {
  return {
    ...base(-30),
    id: id("a"),
    kind,
    side,
    custom_label: null,
    provider,
    account_number: null,
    login_url: null,
    phone: null,
    notes: null,
    scheduled_date: scheduled == null ? null : isoDay(scheduled),
    status,
    confirmed_at: status === "confirmed" ? stamp(-3) : null,
    order_index: order,
  };
}

const utility_transitions: Row[] = [
  utility("electricity", "origin", "City Power & Light", "scheduled", LEASE_END, 0),
  utility("internet", "origin", "Example Fiber", "needs_action", null, 1),
  utility("electricity", "destination", "Harbor Electric", "scheduled", MOVE, 2),
  utility("gas", "destination", "Coastal Gas Co.", "needs_action", null, 3),
  utility("internet", "destination", "Coastline Internet", "confirmed", MOVE + 1, 4),
];

function target(kind: string, name: string, channel: string, status: string, due: number | null, order: number): Row {
  return {
    ...base(-30),
    id: id("b"),
    kind,
    name,
    due_date: due == null ? null : isoDay(due),
    channel,
    reference_number: null,
    status,
    submitted_at: status === "needs_action" ? null : stamp(-4),
    confirmed_at: status === "confirmed" ? stamp(-2) : null,
    notes: null,
    order_index: order,
  };
}

const address_change_targets: Row[] = [
  target("usps", "USPS mail forward", "online", "submitted", MOVE - 1, 0),
  target("employer", "Acme Corp payroll", "online", "confirmed", MOVE, 1),
  target("bank", "Example Bank", "online", "needs_action", MOVE + 7, 2),
  target("dmv", "DMV (new state)", "in_person", "needs_action", MOVE + 10, 3),
  target("voter_reg", "Voter registration (new city)", "online", "needs_action", MOVE + 14, 4),
  target("subscription", "Streaming service", "online", "skipped", null, 5),
];

const insurance_policies: Row[] = [
  {
    ...base(-60),
    id: id("c"),
    scope: "origin",
    property_label: "Juniper Court",
    carrier: "Example Mutual",
    policy_number: null,
    liability_amount: 100000,
    personal_property_amount: 25000,
    monthly_cost: 14,
    effective_from: isoDay(LEASE_END - 365),
    effective_to: isoDay(LEASE_END),
    interested_party_listed: true,
    interested_party_name: "Juniper Court Leasing",
    document_url: null,
  },
  {
    ...base(-10),
    id: id("c"),
    scope: "destination",
    property_label: "Harborview Lofts",
    carrier: "Example Mutual",
    policy_number: null,
    liability_amount: 100000,
    personal_property_amount: 25000,
    monthly_cost: 17,
    effective_from: isoDay(MOVE - 1),
    effective_to: null,
    interested_party_listed: false,
    interested_party_name: null,
    document_url: null,
  },
];

const destinations: Row[] = [
  {
    ...base(-40),
    id: DESTINATION_ID,
    relocation_id: RELOCATION_ID,
    building_name: "Harborview Lofts",
    street_address: "100 Harbor Ave",
    city: "Long Beach",
    state_code: "CA",
    zip_code: "90802",
    source_url: null,
    fetch_status: "manual",
    fetched_at: null,
    monthly_rent_low: 2650,
    monthly_rent_high: 2900,
    application_fee: 50,
    security_deposit: 1000,
    pet_rent_monthly: null,
    parking_monthly: 150,
    beds: 2,
    baths: 1,
    sqft: 950,
    amenities: ["In-unit laundry", "Parking garage", "Rooftop deck"],
    pets_allowed: true,
    furnished: false,
    hud_fmr_2br: null,
    hud_fmr_year: null,
    walk_score: null,
    transit_score: null,
    bike_score: null,
    lat: 33.77,
    lng: -118.19,
    insurance_required: true,
    insurance_min_liability: 100000,
    insurance_min_property: null,
    is_active_target: true,
    notes: "Sample building for the demo.",
  },
];

const move_estimates: Row[] = [
  {
    ...base(-20),
    id: id("d"),
    distance_miles: 1020,
    volume_cuft: 600,
    move_date: isoDay(MOVE),
    scenarios: [
      {
        id: "diy",
        kind: "diy",
        label: "Rental truck",
        line_items: [
          { id: "truck", name: "26 ft truck, one way", cost: 1650 },
          { id: "fuel", name: "Fuel", cost: 420 },
          { id: "hotel", name: "Overnight stop", cost: 140 },
          { id: "supplies", name: "Boxes and supplies", cost: 180 },
        ],
        total: 2390,
      },
      {
        id: "hybrid",
        kind: "hybrid",
        label: "Moving container",
        line_items: [
          { id: "container", name: "Container, door to door", cost: 3100 },
          { id: "loading", name: "Loading help, 2 hours", cost: 260 },
          { id: "supplies", name: "Boxes and supplies", cost: 180 },
        ],
        total: 3540,
      },
      {
        id: "movers",
        kind: "movers",
        label: "Full-service movers",
        line_items: [
          { id: "quote", name: "Mover quote", cost: 5200 },
          { id: "valuation", name: "Full-value protection", cost: 150 },
        ],
        total: 5350,
      },
    ],
    chosen_scenario_id: "hybrid",
  },
];

const saved_neighborhoods: Row[] = [
  { id: id("9"), user_id: DEMO_USER_ID, relocation_id: RELOCATION_ID, neighborhood: "Downtown", city: "Long Beach", notes: null, created_at: stamp(-30) },
  { id: id("9"), user_id: DEMO_USER_ID, relocation_id: RELOCATION_ID, neighborhood: "Belmont Shore", city: "Long Beach", notes: null, created_at: stamp(-28) },
];

export const DEMO_SEED: Record<string, Row[]> = {
  relocations,
  lease_terms,
  lease_events,
  notice_drafts,
  checklist_items,
  utility_transitions,
  address_change_targets,
  insurance_policies,
  destinations,
  move_estimates,
  saved_neighborhoods,
  move_out_walkthroughs: [],
  move_out_room_records: [],
};
