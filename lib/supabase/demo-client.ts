import { randomUUID } from "node:crypto";
import { DEMO_SEED } from "./demo-seed";

/**
 * In-memory stand-in for the Supabase client, used when RELOCA_DEMO_MODE=1
 * (the public portfolio deploy). It implements only the query-builder calls
 * the app makes. Each visitor (keyed by the cookie middleware.ts sets in demo
 * mode) gets a private copy of the seed, so one visitor's edits never show to
 * another. Copies live in module memory and reset when the instance recycles.
 */

type Row = Record<string, unknown>;
type DbError = { message: string; code?: string };
type Result = { data: unknown; error: DbError | null; count: number | null };

const COLUMNS: Record<string, string[]> = {
  checklist_items: ["id", "user_id", "category", "title", "description", "due_date", "completed", "completed_at", "order_index", "created_at", "updated_at"],
  lease_terms: ["id", "user_id", "property_name", "unit_address", "city", "landlord_email", "landlord_display_name", "residents", "lease_start_date", "lease_end_date", "notice_days_required", "target_move_out_date", "renewal_offer_expires", "current_monthly_rent", "renewal_monthly_rent", "m2m_premium", "security_deposit", "pet_rent_monthly", "parking_monthly", "included_utilities", "late_fee_rules", "decision", "origin_lat", "origin_lng", "created_at", "updated_at"],
  lease_events: ["id", "user_id", "lease_id", "kind", "occurs_on", "status", "notes", "created_at"],
  notice_drafts: ["id", "user_id", "lease_id", "body_markdown", "body_plaintext", "subject_line", "recipient_email", "move_out_date", "created_at", "sent_at"],
  destinations: ["id", "user_id", "relocation_id", "building_name", "street_address", "city", "state_code", "zip_code", "source_url", "fetch_status", "fetched_at", "monthly_rent_low", "monthly_rent_high", "application_fee", "security_deposit", "pet_rent_monthly", "parking_monthly", "beds", "baths", "sqft", "amenities", "pets_allowed", "furnished", "hud_fmr_2br", "hud_fmr_year", "walk_score", "transit_score", "bike_score", "lat", "lng", "insurance_required", "insurance_min_liability", "insurance_min_property", "is_active_target", "notes", "created_at", "updated_at"],
  insurance_policies: ["id", "user_id", "scope", "property_label", "carrier", "policy_number", "liability_amount", "personal_property_amount", "monthly_cost", "effective_from", "effective_to", "interested_party_listed", "interested_party_name", "document_url", "created_at", "updated_at"],
  utility_transitions: ["id", "user_id", "kind", "side", "custom_label", "provider", "account_number", "login_url", "phone", "notes", "scheduled_date", "status", "confirmed_at", "order_index", "created_at", "updated_at"],
  address_change_targets: ["id", "user_id", "kind", "name", "due_date", "channel", "reference_number", "status", "submitted_at", "confirmed_at", "notes", "order_index", "created_at", "updated_at"],
  move_estimates: ["id", "user_id", "distance_miles", "volume_cuft", "move_date", "scenarios", "chosen_scenario_id", "created_at", "updated_at"],
  move_out_walkthroughs: ["id", "user_id", "lease_terms_id", "walkthrough_date", "overall_notes", "pdf_generated_at", "created_at", "updated_at"],
  move_out_room_records: ["id", "walkthrough_id", "user_id", "room_name", "condition_rating", "cleanliness_rating", "walls_status", "floors_status", "appliances_status", "fixtures_status", "notes", "order_index", "created_at", "updated_at"],
  saved_neighborhoods: ["id", "user_id", "relocation_id", "neighborhood", "city", "notes", "created_at"],
  relocations: ["id", "user_id", "label", "origin_slug", "destination_slug", "move_date", "is_active_move", "created_at", "updated_at"],
};

// Column defaults from supabase/migrations (id and timestamps handled below).
const DEFAULTS: Record<string, Row> = {
  checklist_items: { completed: false, order_index: 0 },
  lease_terms: { notice_days_required: 60, m2m_premium: 0, pet_rent_monthly: 0, parking_monthly: 0, included_utilities: [], decision: "undecided" },
  lease_events: { status: "pending" },
  destinations: { fetch_status: "manual", amenities: [], insurance_required: true, is_active_target: false },
  insurance_policies: { interested_party_listed: false },
  utility_transitions: { status: "needs_action", order_index: 0 },
  address_change_targets: { status: "needs_action", order_index: 0 },
  move_estimates: { scenarios: [] },
  move_out_room_records: { order_index: 0 },
  relocations: { is_active_move: false },
};

type Store = Record<string, Row[]>;

// Must match middleware.ts.
const DEMO_VISITOR_COOKIE = "reloca_demo_visitor";
const VISITOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Public demo: bound memory so one visitor (or a script) cannot take the
// instance down. Worst case is roughly MAX_VISITORS * MAX_STORE_BYTES.
const MAX_VISITORS = 200;
const MAX_STORE_BYTES = 1_000_000;
const MAX_ROWS_PER_TABLE = 100;
const LIMIT_ERROR: DbError = {
  message: "The demo keeps a small amount of data per visitor. Delete something and try again.",
};
const stores = new Map<string, Store>();
// Visitors who have not written anything read this copy, so page views and
// crawlers never create or evict stores. Reads never mutate rows.
const seedView = structuredClone(DEMO_SEED) as Store;

// Outside a request (tests, scripts) there are no cookies; those share one copy.
async function visitorId(): Promise<string> {
  try {
    const { cookies } = await import("next/headers");
    const id = (await cookies()).get(DEMO_VISITOR_COOKIE)?.value;
    return id && VISITOR_ID.test(id) ? id : "shared";
  } catch {
    return "shared";
  }
}

async function currentStore(forWrite: boolean): Promise<Store> {
  const key = await visitorId();
  let store = stores.get(key);
  if (store) {
    // Least recently used goes first when the map is full.
    stores.delete(key);
    stores.set(key, store);
    return store;
  }
  if (!forWrite) return seedView;
  if (stores.size >= MAX_VISITORS) stores.delete(stores.keys().next().value!);
  store = structuredClone(DEMO_SEED) as Store;
  stores.set(key, store);
  return store;
}

function bytes(value: unknown): number {
  return JSON.stringify(value ?? null).length;
}

function table(all: Store, name: string): Row[] {
  const columns = COLUMNS[name];
  if (!columns) throw new Error(`Demo client: unknown table "${name}"`);
  all[name] ??= [];
  return all[name];
}

function newRow(name: string, input: Row): Row {
  const now = new Date().toISOString();
  const row: Row = {};
  for (const col of COLUMNS[name]) row[col] = null;
  Object.assign(row, DEFAULTS[name] ?? {});
  row.id = randomUUID();
  if ("created_at" in row) row.created_at = now;
  if ("updated_at" in row) row.updated_at = now;
  return Object.assign(row, input);
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

type Op = "select" | "insert" | "update" | "delete" | "upsert";

class DemoQuery implements PromiseLike<Result> {
  private op: Op = "select";
  private filters: ((r: Row) => boolean)[] = [];
  private orders: { col: string; asc: boolean; nullsFirst: boolean }[] = [];
  private limitN: number | null = null;
  private mode: "many" | "single" | "maybe" = "many";
  private columns = "*";
  private returning = false;
  private countRequested = false;
  private head = false;
  private payload: Row | Row[] | null = null;
  private onConflict: string[] = [];
  private ignoreDuplicates = false;

  constructor(private readonly name: string) {}

  select(columns = "*", opts?: { count?: string; head?: boolean }) {
    if (this.op === "select") {
      this.countRequested = Boolean(opts?.count);
      this.head = Boolean(opts?.head);
    } else {
      this.returning = true;
    }
    this.columns = columns;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.payload = rows;
    return this;
  }
  upsert(rows: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.op = "upsert";
    this.payload = rows;
    this.onConflict = (opts?.onConflict ?? "id").split(",").map((c) => c.trim());
    this.ignoreDuplicates = Boolean(opts?.ignoreDuplicates);
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.payload = patch;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(col: string, value: unknown) {
    this.filters.push((r) => r[col] === value);
    return this;
  }
  neq(col: string, value: unknown) {
    this.filters.push((r) => r[col] !== value);
    return this;
  }
  in(col: string, values: unknown[]) {
    this.filters.push((r) => values.includes(r[col]));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    const asc = opts?.ascending ?? true;
    // Postgres default: NULLS LAST ascending, NULLS FIRST descending.
    this.orders.push({ col, asc, nullsFirst: opts?.nullsFirst ?? !asc });
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }
  maybeSingle() {
    this.mode = "maybe";
    return this;
  }

  then<A = Result, B = never>(
    onFulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return currentStore(this.op !== "select")
      .then((all) => this.run(all))
      .then(onFulfilled, onRejected);
  }

  private matches(rows: Row[]): Row[] {
    return rows.filter((r) => this.filters.every((f) => f(r)));
  }

  private run(all: Store): Result {
    const rows = table(all, this.name);
    let affected: Row[] = [];

    if (this.op !== "select" && this.op !== "delete") {
      const input = Array.isArray(this.payload) ? this.payload : [this.payload];
      const growth = this.op === "update" ? bytes(this.payload) * this.matches(rows).length : bytes(input);
      const newRows = this.op === "update" ? 0 : input.length;
      if (rows.length + newRows > MAX_ROWS_PER_TABLE || bytes(all) + growth > MAX_STORE_BYTES) {
        return { data: null, error: LIMIT_ERROR, count: null };
      }
    }

    if (this.op === "select") {
      affected = this.matches(rows);
    } else if (this.op === "insert") {
      const input = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
      affected = input.map((r) => newRow(this.name, r));
      rows.push(...affected);
    } else if (this.op === "upsert") {
      const input = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
      for (const r of input) {
        const existing = rows.find((x) => this.onConflict.every((c) => x[c] === r[c]));
        if (existing) {
          if (!this.ignoreDuplicates) {
            Object.assign(existing, r, "updated_at" in existing ? { updated_at: new Date().toISOString() } : {});
            affected.push(existing);
          }
        } else {
          const created = newRow(this.name, r);
          rows.push(created);
          affected.push(created);
        }
      }
    } else if (this.op === "update") {
      affected = this.matches(rows);
      for (const r of affected) {
        Object.assign(r, this.payload, "updated_at" in r ? { updated_at: new Date().toISOString() } : {});
      }
    } else {
      affected = this.matches(rows);
      const gone = new Set(affected);
      const kept = rows.filter((r) => !gone.has(r));
      rows.splice(0, rows.length, ...kept);
    }

    const count = this.countRequested ? affected.length : null;
    if (this.op !== "select" && !this.returning) return { data: null, error: null, count };
    if (this.head) return { data: null, error: null, count };

    let out = [...affected];
    for (const { col, asc, nullsFirst } of [...this.orders].reverse()) {
      out.sort((a, b) => {
        const av = a[col];
        const bv = b[col];
        if (av == null || bv == null) {
          if (av == null && bv == null) return 0;
          return (av == null) === nullsFirst ? -1 : 1;
        }
        return asc ? compare(av, bv) : compare(bv, av);
      });
    }
    if (this.limitN != null) out = out.slice(0, this.limitN);
    const picked = out.map((r) => this.project(r));

    if (this.mode === "many") return { data: picked, error: null, count };
    if (picked.length > 1) {
      return { data: null, error: { message: "Multiple rows returned", code: "PGRST116" }, count };
    }
    if (picked.length === 0) {
      return this.mode === "maybe"
        ? { data: null, error: null, count }
        : { data: null, error: { message: "No rows returned", code: "PGRST116" }, count };
    }
    return { data: picked[0], error: null, count };
  }

  private project(r: Row): Row {
    if (this.columns.trim() === "*") return structuredClone(r);
    const out: Row = {};
    for (const c of this.columns.split(",").map((s) => s.trim())) out[c] = structuredClone(r[c]);
    return out;
  }
}

function reorderChecklistItem(all: Store, args: { p_id: string; p_target_category: string; p_target_index: number }): Result {
  const rows = table(all, "checklist_items");
  const item = rows.find((r) => r.id === args.p_id);
  if (!item) return { data: null, error: { message: "Checklist item not found" }, count: null };
  const byIndex = (a: Row, b: Row) => compare(a.order_index, b.order_index);
  const source = rows.filter((r) => r.category === item.category && r !== item).sort(byIndex);
  source.forEach((r, i) => (r.order_index = i));
  const dest = rows.filter((r) => r.category === args.p_target_category && r !== item).sort(byIndex);
  dest.splice(Math.min(Math.max(args.p_target_index, 0), dest.length), 0, item);
  item.category = args.p_target_category;
  dest.forEach((r, i) => (r.order_index = i));
  return { data: null, error: null, count: null };
}

export function createDemoClient() {
  return {
    from: (name: string) => new DemoQuery(name),
    rpc: async (fn: string, args: Record<string, unknown>): Promise<Result> => {
      if (fn === "reorder_checklist_item") {
        return reorderChecklistItem(await currentStore(true), args as { p_id: string; p_target_category: string; p_target_index: number });
      }
      return { data: null, error: { message: `Demo client: unknown function "${fn}"` }, count: null };
    },
  };
}
