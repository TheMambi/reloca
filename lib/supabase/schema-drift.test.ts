// Run: npx tsx lib/supabase/schema-drift.test.ts
//
// A table's shape is written down in three places: the migrations, the
// generated lib/supabase/types.ts, and the row schemas in schemas/*.ts. This
// file fails when they disagree.
//
//   1. Row schemas against types.ts: checked by the type checker, below.
//   2. Row schemas, value lists, the demo database's defaults and types.ts
//      against a database built from the migrations: checked at run time, and
//      only when RELOCA_CHECK_DB holds a psql connection string for such a
//      database. `pnpm db:check` builds one and sets it.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { z } from "zod";
import { ChecklistCategorySchema } from "@/schemas/checklist";
import {
  FetchStatusEnum,
  InsuranceScopeEnum,
  LeaseDecisionEnum,
  LeaseEventKindEnum,
  LeaseEventStatusEnum,
} from "@/schemas/lease";
import { TABLE_SCHEMAS } from "@/schemas/tables";
import {
  AddressTargetChannelEnum,
  AddressTargetKindEnum,
  AddressTargetStatusEnum,
  UtilityKindEnum,
  UtilitySideEnum,
  UtilityStatusEnum,
} from "@/schemas/transitions";
import { DEFAULTS } from "./demo-client";
import type { Database, Json } from "./types";

// ── 1. Compile time ────────────────────────────────────────────────────────
// For every table, the row schema and the generated Row must have the same
// columns, and agree on which may be null. A difference is a type error on the
// table's line in `sameShape` that names the column. JSON columns are left to
// the run-time half: the generated Json type includes null either way.
type Tables = Database["public"]["Tables"];
type Differing<Z, R> = {
  [K in keyof Z | keyof R]-?: K extends keyof Z & keyof R
    ? Json extends R[K]
      ? never
      : [null extends Z[K] ? 1 : 0] extends [null extends R[K] ? 1 : 0]
        ? never
        : K
    : K;
}[keyof Z | keyof R];
type Same<Z, R> = [Differing<Z, R>] extends [never] ? true : { differs: Differing<Z, R> };
const sameShape: {
  [T in keyof typeof TABLE_SCHEMAS]: Same<z.infer<(typeof TABLE_SCHEMAS)[T]>, Tables[T]["Row"]>;
} & { [T in keyof Tables]: true } = {
  address_change_targets: true,
  checklist_items: true,
  destinations: true,
  insurance_policies: true,
  lease_events: true,
  lease_terms: true,
  move_estimates: true,
  move_out_room_records: true,
  move_out_walkthroughs: true,
  notice_drafts: true,
  relocations: true,
  saved_neighborhoods: true,
  utility_transitions: true,
};
void sameShape;

// ── 2. Run time, against a database ────────────────────────────────────────
// Every column whose CHECK is a list of values, and the schema that must list
// the same values. A new list in a migration fails until it is added here.
const VALUE_LISTS: Record<string, readonly string[]> = {
  "address_change_targets.channel": AddressTargetChannelEnum.options,
  "address_change_targets.kind": AddressTargetKindEnum.options,
  "address_change_targets.status": AddressTargetStatusEnum.options,
  "checklist_items.category": ChecklistCategorySchema.options,
  "destinations.fetch_status": FetchStatusEnum.options,
  "insurance_policies.scope": InsuranceScopeEnum.options,
  "lease_events.kind": LeaseEventKindEnum.options,
  "lease_events.status": LeaseEventStatusEnum.options,
  "lease_terms.decision": LeaseDecisionEnum.options,
  "utility_transitions.kind": UtilityKindEnum.options,
  "utility_transitions.side": UtilitySideEnum.options,
  "utility_transitions.status": UtilityStatusEnum.options,
};

function query<T>(connection: string, sql: string): T {
  const result = spawnSync(
    "psql",
    ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", `select coalesce(json_agg(q), '[]') from (${sql}) q`, connection],
    { encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message || "psql failed");
  return JSON.parse(result.stdout) as T;
}

// "'undecided'::text" -> "undecided", "60" -> 60, "'{}'::text[]" -> [], "'[]'::jsonb" -> []
function defaultValue(expression: string): unknown {
  const text = expression.replace(/::[a-z_ ]+(\[\])?$/, "");
  if (text === "true" || text === "false") return text === "true";
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  if (text === "'{}'" || text === "'[]'") return [];
  const quoted = /^'(.*)'$/.exec(text);
  if (quoted) return quoted[1];
  throw new Error(`schema-drift: cannot read the column default ${expression}`);
}

function checkAgainstDatabase(connection: string) {
  const columns = query<{ table_name: string; column_name: string; is_nullable: string; column_default: string | null }[]>(
    connection,
    `select table_name, column_name, is_nullable, column_default
     from information_schema.columns where table_schema = 'public'`,
  );
  const tableNames = [...new Set(columns.map((c) => c.table_name))].sort();
  assert.deepEqual(tableNames, Object.keys(TABLE_SCHEMAS).sort(), "tables in the database and in schemas/tables.ts");

  for (const [table, schema] of Object.entries(TABLE_SCHEMAS)) {
    const inDatabase = Object.fromEntries(
      columns.filter((c) => c.table_name === table).map((c) => [c.column_name, c.is_nullable === "YES"]),
    );
    const inSchema = Object.fromEntries(
      Object.entries(schema.shape).map(([name, field]) => [name, (field as z.ZodType).safeParse(null).success]),
    );
    assert.deepEqual(inSchema, inDatabase, `${table}: columns and which may be empty, row schema against database`);

    const defaults: Record<string, unknown> = {};
    for (const c of columns.filter((c) => c.table_name === table)) {
      if (c.column_default === null || /^(gen_random_uuid|now)\(\)$/.test(c.column_default)) continue;
      defaults[c.column_name] = defaultValue(c.column_default);
    }
    assert.deepEqual(DEFAULTS[table] ?? {}, defaults, `${table}: column defaults, demo database against database`);
  }

  const lists = query<{ table_name: string; column_name: string; definition: string }[]>(
    connection,
    `select c.relname as table_name, a.attname as column_name, pg_get_constraintdef(k.oid) as definition
     from pg_constraint k
     join pg_class c on c.oid = k.conrelid
     join pg_namespace n on n.oid = c.relnamespace
     join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
     where n.nspname = 'public' and k.contype = 'c' and cardinality(k.conkey) = 1
       and pg_get_constraintdef(k.oid) like '%= ANY (ARRAY[%'`,
  );
  const found: Record<string, string[]> = {};
  for (const list of lists) {
    found[`${list.table_name}.${list.column_name}`] = [...list.definition.matchAll(/'([^']*)'::text/g)].map((m) => m[1]).sort();
  }
  const expected = Object.fromEntries(Object.entries(VALUE_LISTS).map(([column, values]) => [column, [...values].sort()]));
  assert.deepEqual(found, expected, "allowed values, CHECK constraints against schema enums");

  const generated = spawnSync(process.execPath, ["scripts/gen-db-types.mjs", connection], { encoding: "utf8" });
  if (generated.status !== 0) throw new Error(generated.stderr);
  assert.equal(
    readFileSync("lib/supabase/types.ts", "utf8"),
    generated.stdout,
    'lib/supabase/types.ts is out of date. Run: node scripts/gen-db-types.mjs "<local connection>" > lib/supabase/types.ts',
  );
}

const connection = process.env.RELOCA_CHECK_DB;
if (connection) {
  checkAgainstDatabase(connection);
  console.log("schema-drift: row schemas, value lists, defaults and types.ts match the database.");
} else {
  console.log("schema-drift: database half skipped (no RELOCA_CHECK_DB). Run `pnpm db:check` after changing a migration.");
}
