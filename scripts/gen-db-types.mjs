// Prints lib/supabase/types.ts for the database a psql connection string points at.
//
//   node scripts/gen-db-types.mjs "<local connection>" > lib/supabase/types.ts
//
// The output has the shape `supabase gen types typescript` writes (tables,
// columns and function arguments in alphabetical order), so either tool can
// own the file. This one needs only psql, which lets scripts/db-check.sh
// compare the committed file with a database built from the migrations.
import { spawnSync } from "node:child_process";

const connection = process.argv[2];
if (!connection) {
  console.error('Usage: node scripts/gen-db-types.mjs "<psql connection string>"');
  process.exit(1);
}

const QUERY = `
select json_build_object(
  'columns', (
    select coalesce(json_agg(json_build_object(
      'table', c.relname, 'column', a.attname, 'type', t.typname,
      'required', a.attnotnull,
      'filled', a.atthasdef or a.attidentity <> '' or a.attgenerated <> ''
    )), '[]')
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_type t on t.oid = a.atttypid
    where n.nspname = 'public' and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped
  ),
  'relationships', (
    select coalesce(json_agg(json_build_object(
      'table', c.relname, 'name', k.conname, 'referenced', f.relname,
      'columns', (select json_agg(a.attname order by x.ord) from unnest(k.conkey) with ordinality x(num, ord)
                  join pg_attribute a on a.attrelid = k.conrelid and a.attnum = x.num),
      'referencedColumns', (select json_agg(a.attname order by x.ord) from unnest(k.confkey) with ordinality x(num, ord)
                  join pg_attribute a on a.attrelid = k.confrelid and a.attnum = x.num),
      'oneToOne', exists (select 1 from pg_index i where i.indrelid = k.conrelid and i.indisunique
                  and i.indpred is null and i.indkey::int2[] <@ k.conkey and i.indkey::int2[] @> k.conkey)
    )), '[]')
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid
    join pg_class f on f.oid = k.confrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and k.contype = 'f'
  ),
  'functions', (
    select coalesce(json_agg(json_build_object(
      'name', p.proname, 'returns', r.typname,
      'args', (select coalesce(json_agg(json_build_object('name', p.proargnames[x.ord], 'type', t.typname)), '[]')
               from unnest(p.proargtypes::oid[]) with ordinality x(type_oid, ord)
               join pg_type t on t.oid = x.type_oid)
    )), '[]')
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_type r on r.oid = p.prorettype
    where n.nspname = 'public' and p.prokind = 'f' and r.typname <> 'trigger'
      -- not the functions an extension installed
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  )
)`;

const result = spawnSync("psql", ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", QUERY, connection], {
  encoding: "utf8",
});
if (result.status !== 0) {
  console.error(result.stderr || result.error?.message || "psql failed");
  process.exit(1);
}
const db = JSON.parse(result.stdout);

const SCALARS = {
  bool: "boolean",
  int2: "number", int4: "number", int8: "number", float4: "number", float8: "number", numeric: "number",
  json: "Json", jsonb: "Json",
  uuid: "string", text: "string", varchar: "string", bpchar: "string",
  date: "string", time: "string", timetz: "string", timestamp: "string", timestamptz: "string",
  void: "undefined",
};

function tsType(pgType) {
  if (pgType.startsWith("_")) return `${tsType(pgType.slice(1))}[]`;
  const mapped = SCALARS[pgType];
  // Fail instead of guessing: a wrong type here would be trusted everywhere.
  if (!mapped) throw new Error(`gen-db-types: no TypeScript type for Postgres type "${pgType}"`);
  return mapped;
}

const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const tables = [...new Set(db.columns.map((c) => c.table))].sort(byName);
const out = [];

out.push(`// Generated from the database by scripts/gen-db-types.mjs. Do not edit by hand.
// To change a table, add a migration, then run \`pnpm db:check\` and follow its
// message. docs/database.md has the details.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {`);

for (const table of tables) {
  const columns = db.columns.filter((c) => c.table === table).sort((a, b) => byName(a.column, b.column));
  const row = columns.map((c) => `          ${c.column}: ${tsType(c.type)}${c.required ? "" : " | null"}`);
  const insert = columns.map(
    (c) => `          ${c.column}${c.required && !c.filled ? "" : "?"}: ${tsType(c.type)}${c.required ? "" : " | null"}`,
  );
  const update = columns.map((c) => `          ${c.column}?: ${tsType(c.type)}${c.required ? "" : " | null"}`);
  const relationships = db.relationships
    .filter((r) => r.table === table)
    .sort((a, b) => byName(a.name, b.name))
    .map(
      (r) => `          {
            foreignKeyName: ${JSON.stringify(r.name)}
            columns: ${JSON.stringify(r.columns)}
            isOneToOne: ${r.oneToOne}
            referencedRelation: ${JSON.stringify(r.referenced)}
            referencedColumns: ${JSON.stringify(r.referencedColumns)}
          },`,
    );
  out.push(`      ${table}: {
        Row: {
${row.join("\n")}
        }
        Insert: {
${insert.join("\n")}
        }
        Update: {
${update.join("\n")}
        }
        Relationships: [${relationships.length ? `\n${relationships.join("\n")}\n        ` : ""}]
      }`);
}

out.push(`    }
    Views: {
      [_ in never]: never
    }
    Functions: {`);

for (const fn of [...db.functions].sort((a, b) => byName(a.name, b.name))) {
  const args = [...fn.args].sort((a, b) => byName(a.name, b.name));
  out.push(`      ${fn.name}: {
        Args: ${args.length ? `{ ${args.map((a) => `${a.name}: ${tsType(a.type)}`).join("; ")} }` : "never"}
        Returns: ${tsType(fn.returns)}
      }`);
}

out.push(`    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}`);

console.log(out.join("\n"));
