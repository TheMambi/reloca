import { randomUUID } from "node:crypto";
import { TABLE_SCHEMAS } from "@/schemas/tables";
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

const COLUMNS: Record<string, string[]> = Object.fromEntries(
  Object.entries(TABLE_SCHEMAS).map(([name, schema]) => [name, Object.keys(schema.shape)]),
);

// Column defaults from supabase/migrations (id and timestamps handled below).
// schema-drift.test.ts compares them with the database.
export const DEFAULTS: Record<string, Row> = {
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
const NO_VISITOR_ERROR: DbError = { message: "Demo client: this request carries no visitor cookie" };
const NOT_JSON_ERROR: DbError = { message: "Demo client: a value is not plain JSON", code: "22P02" };

// The rules of supabase/migrations that the app leans on, so a write the
// database would refuse is refused here too. A row with NULL in a unique
// column never collides, as in SQL.
type UniqueKey = { cols: string[]; where?: (r: Row) => boolean };
const UNIQUE: Record<string, UniqueKey[]> = {
  relocations: [{ cols: ["user_id"], where: (r) => r.is_active_move === true }],
  checklist_items: [{ cols: ["user_id", "category", "order_index"] }],
  destinations: [{ cols: ["user_id"], where: (r) => r.is_active_target === true }],
  move_estimates: [{ cols: ["user_id"] }],
  saved_neighborhoods: [{ cols: ["user_id", "neighborhood", "city"] }],
};
type ForeignKey = { table: string; col: string; parent: string; onDelete: "cascade" | "set null" };
const FOREIGN_KEYS: ForeignKey[] = [
  { table: "lease_events", col: "lease_id", parent: "lease_terms", onDelete: "cascade" },
  { table: "notice_drafts", col: "lease_id", parent: "lease_terms", onDelete: "cascade" },
  { table: "move_out_room_records", col: "walkthrough_id", parent: "move_out_walkthroughs", onDelete: "cascade" },
  { table: "move_out_walkthroughs", col: "lease_terms_id", parent: "lease_terms", onDelete: "set null" },
  { table: "destinations", col: "relocation_id", parent: "relocations", onDelete: "set null" },
  { table: "saved_neighborhoods", col: "relocation_id", parent: "relocations", onDelete: "set null" },
];
const stores = new Map<string, Store>();
// Visitors who have not written anything read this copy, so page views and
// crawlers never create or evict stores. Reads never mutate rows.
const seedView = structuredClone(DEMO_SEED) as Store;

// A request with no valid cookie has no copy of its own: it reads the seed and
// cannot write. Outside a request (tests, scripts) there are no cookies at
// all; those share one copy, but never on a production server.
async function visitorId(): Promise<string | null> {
  let jar;
  try {
    const { cookies } = await import("next/headers");
    jar = await cookies();
  } catch {
    return process.env.NODE_ENV === "production" ? null : "shared";
  }
  const id = jar.get(DEMO_VISITOR_COOKIE)?.value;
  return id && VISITOR_ID.test(id) ? id : null;
}

async function currentStore(forWrite: boolean): Promise<Store | null> {
  const key = await visitorId();
  if (key === null) return forWrite ? null : seedView;
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

// Only for values that passed isPlainJson: anything else (a Map, a typed
// array) turns into "{}" here whatever it holds.
function bytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value ?? null));
}

// Server-action arguments can carry Map, Set, ArrayBuffer and Blob. The real
// client would send those as "{}"; here they would be held in memory at full
// size and counted as two characters.
function isPlainJson(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isPlainJson);
  if (typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false;
  return Object.values(value).every(isPlainJson);
}

function duplicate(name: string, rows: Row[]): boolean {
  for (const key of [{ cols: ["id"] }, ...(UNIQUE[name] ?? [])] as UniqueKey[]) {
    const seen = new Set<string>();
    for (const r of rows) {
      if (key.where && !key.where(r)) continue;
      if (key.cols.some((c) => r[c] == null)) continue;
      const k = JSON.stringify(key.cols.map((c) => r[c]));
      if (seen.has(k)) return true;
      seen.add(k);
    }
  }
  return false;
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

function updatedRow(name: string, old: Row, patch: Row): Row {
  const row: Row = { ...old, ...patch };
  if ("updated_at" in row) row.updated_at = new Date().toISOString();
  // The sync_completed_at trigger.
  if (name === "checklist_items") {
    if (row.completed === true && old.completed !== true) row.completed_at = new Date().toISOString();
    else if (row.completed === false) row.completed_at = null;
  }
  return row;
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
    // SQL: NULL <> value is not true, so rows with NULL do not match.
    this.filters.push((r) => r[col] != null && r[col] !== value);
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
      .then((all) => (all ? this.run(all) : { data: null, error: NO_VISITOR_ERROR, count: null }))
      .then(onFulfilled, onRejected);
  }

  private matches(rows: Row[]): Row[] {
    return rows.filter((r) => this.filters.every((f) => f(r)));
  }

  private run(all: Store): Result {
    const rows = table(all, this.name);
    let affected: Row[] = [];

    if (this.op === "select") {
      affected = this.matches(rows);
    } else if (this.op === "delete") {
      affected = this.matches(rows);
      const gone = new Set(affected);
      const kept = rows.filter((r) => !gone.has(r));
      rows.splice(0, rows.length, ...kept);
      this.afterDelete(all, affected);
    } else {
      if (!isPlainJson(this.payload)) return { data: null, error: NOT_JSON_ERROR, count: null };
      // What the real client does on the way out: undefined keys are dropped.
      const payload = JSON.parse(JSON.stringify(this.payload ?? {})) as Row | Row[];
      const input = Array.isArray(payload) ? payload : [payload];
      // The write is worked out on a copy of the table and kept only if every rule holds.
      const next = [...rows];
      if (this.op === "insert") {
        affected = input.map((r) => newRow(this.name, r));
        next.push(...affected);
      } else if (this.op === "upsert") {
        for (const r of input) {
          const at = next.findIndex((x) => this.onConflict.every((c) => x[c] === r[c]));
          if (at === -1) {
            const created = newRow(this.name, r);
            next.push(created);
            affected.push(created);
          } else if (!this.ignoreDuplicates) {
            next[at] = updatedRow(this.name, next[at], r);
            affected.push(next[at]);
          }
        }
      } else {
        const hit = new Set(this.matches(rows));
        next.forEach((r, i) => {
          if (!hit.has(r)) return;
          next[i] = updatedRow(this.name, r, input[0]);
          affected.push(next[i]);
        });
      }
      if (next.length > MAX_ROWS_PER_TABLE || bytes({ ...all, [this.name]: next }) > MAX_STORE_BYTES) {
        return { data: null, error: LIMIT_ERROR, count: null };
      }
      const refused = this.refusal(all, next, affected);
      if (refused) return { data: null, error: refused, count: null };
      rows.splice(0, rows.length, ...next);
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

  // Column types, NOT NULL, value lists and real calendar dates come from the
  // row schema, which schema-drift.test.ts holds against the database.
  private refusal(all: Store, next: Row[], changed: Row[]): DbError | null {
    for (const r of changed) {
      const parsed = TABLE_SCHEMAS[this.name as keyof typeof TABLE_SCHEMAS].safeParse(r);
      if (!parsed.success) {
        const column = String(parsed.error.issues[0]?.path[0] ?? "row");
        return { message: `Demo client: "${column}" in "${this.name}" breaks a column rule`, code: "23514" };
      }
      for (const fk of FOREIGN_KEYS) {
        if (fk.table !== this.name || r[fk.col] == null) continue;
        if (!table(all, fk.parent).some((p) => p.id === r[fk.col])) {
          return { message: `Demo client: "${fk.col}" in "${this.name}" points at no row`, code: "23503" };
        }
      }
    }
    if (duplicate(this.name, next)) {
      return { message: `Demo client: duplicate key in "${this.name}"`, code: "23505" };
    }
    return null;
  }

  private afterDelete(all: Store, deleted: Row[]): void {
    const ids = new Set(deleted.map((r) => r.id));
    for (const fk of FOREIGN_KEYS) {
      if (fk.parent !== this.name) continue;
      const children = table(all, fk.table);
      if (fk.onDelete === "set null") {
        for (const c of children) if (ids.has(c[fk.col])) c[fk.col] = null;
        continue;
      }
      const gone = children.filter((c) => ids.has(c[fk.col]));
      if (gone.length === 0) continue;
      children.splice(0, children.length, ...children.filter((c) => !ids.has(c[fk.col])));
      new DemoQuery(fk.table).afterDelete(all, gone);
    }
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
  if (!TABLE_SCHEMAS.checklist_items.shape.category.safeParse(args.p_target_category).success || !Number.isInteger(args.p_target_index)) {
    return { data: null, error: NOT_JSON_ERROR, count: null };
  }
  if (!item) return { data: null, error: { message: "Checklist item not found" }, count: null };
  if (item.category === "lease" || args.p_target_category === "lease") {
    return { data: null, error: { message: "Lease tasks cannot be reordered" }, count: null };
  }
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
        const all = await currentStore(true);
        if (!all) return { data: null, error: NO_VISITOR_ERROR, count: null };
        return reorderChecklistItem(all, args as { p_id: string; p_target_category: string; p_target_index: number });
      }
      return { data: null, error: { message: `Demo client: unknown function "${fn}"` }, count: null };
    },
  };
}
