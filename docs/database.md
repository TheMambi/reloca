# The database

How the tables are built, how a change reaches the hosted database, and how the code is kept in step with it. `docs/security-lockdown.md` covers who may reach the data. `docs/schema.md` is the design history.

## What is in `supabase/`

| Path | What it is |
|---|---|
| `config.toml` | Settings for the Supabase CLI. Set `major_version` to your project's Postgres version. |
| `migrations/0024_baseline.sql` | All 13 tables, their indexes and triggers, and the checklist reorder function. It replaces the original files 0001 to 0024, which had a user id typed into each by hand. |
| `migrations/0025` to `0027` | The lockdown and the reorder fix. On a new database they change little, because the baseline already starts closed. On a database set up from the original files they do the real work. |
| `migrations/0028_checks_match_app_rules.sql` | CHECK constraints for the rules the app enforces on read. |
| `tests/*.sql` | Checks for a local database only. Never run them against the hosted one. |

Every migration runs exactly as written. None has a placeholder, and each can be run twice without harm.

There is no seed. A new database starts empty, and the first move you add in the app also adds the starter checklist.

## A new database

```
supabase link --project-ref <your project ref>
supabase db push
```

`db push` applies every file in `supabase/migrations/` in order and records each one in `supabase_migrations.schema_migrations`, so the database itself knows what it has had. `supabase db push --dry-run` lists what would run without running it.

For a local Supabase stack (it needs Docker): `supabase start`, and `supabase db reset` to rebuild from the migrations.

## A database that was set up by hand

The first database was built by pasting files 0001 to 0024 into the SQL editor, so it has no migration history and `db push` would try to run the baseline on top of it. Tell the CLI the baseline is already there instead. Do this once.

1. Follow the rollout order in `docs/security-lockdown.md` first. The app code must be deployed before 0025 runs.
2. `supabase link --project-ref <your project ref>`
3. Record the baseline as applied without running it:

   ```
   supabase migration repair 0024 --status applied
   ```

   If you already ran 0025, 0026 or 0027 in the SQL editor, record each of those the same way.
4. Look for rows that 0028 would refuse (the query is below). Fix any it finds.
5. `supabase db push --dry-run` must list only the files that have not run yet. Then `supabase db push`.
6. Run the two checks in `docs/security-lockdown.md`.
7. Confirm the hosted schema matches the files: `supabase db diff --linked` (it needs Docker) should report no difference. This is the one proof that could not be done while writing these files, because it needs the hosted database.

What was proved instead, on a local PostgreSQL 16: a database built from the original 0001 to 0027 with 0028 on top, and a database built from the files as they are now, give the same `pg_dump --schema-only` output, line for line.

The CLI commands above were written from Supabase's documentation and were not run here. The CLI takes the digits before the first underscore of a file name as the version. If a CLI release ever refuses four-digit names, rename the files to timestamps before the first push, never after.

### Rows that 0028 would refuse

Run this in the SQL editor before pushing 0028. It only reads. No rows means 0028 will apply.

```sql
select 'checklist_items' as table_name, id, 'order_index below 0' as problem from checklist_items where order_index < 0
union all select 'utility_transitions', id, 'order_index below 0' from utility_transitions where order_index < 0
union all select 'address_change_targets', id, 'order_index below 0' from address_change_targets where order_index < 0
union all select 'move_out_room_records', id, 'order_index below 0' from move_out_room_records where order_index < 0
union all select 'lease_terms', id, 'residents is not a list with at least one entry' from lease_terms
  where case when jsonb_typeof(residents) = 'array' then jsonb_array_length(residents) < 1 else true end
union all select 'lease_terms', id, 'lease ends before it starts' from lease_terms where lease_end_date < lease_start_date
union all select 'lease_terms', id, 'a negative amount' from lease_terms
  where least(notice_days_required, current_monthly_rent, renewal_monthly_rent, m2m_premium,
              security_deposit, pet_rent_monthly, parking_monthly) < 0
union all select 'destinations', id, 'a negative amount' from destinations
  where least(monthly_rent_low, monthly_rent_high, application_fee, security_deposit, pet_rent_monthly,
              parking_monthly, beds, baths, hud_fmr_2br, insurance_min_liability, insurance_min_property) < 0
union all select 'destinations', id, 'a score outside 0 to 100' from destinations
  where least(walk_score, transit_score, bike_score) < 0 or greatest(walk_score, transit_score, bike_score) > 100
union all select 'insurance_policies', id, 'a negative amount' from insurance_policies
  where least(liability_amount, personal_property_amount, monthly_cost) < 0
union all select 'insurance_policies', id, 'cover ends before it starts' from insurance_policies where effective_to < effective_from
union all select 'move_estimates', id, 'scenarios is not a list' from move_estimates where jsonb_typeof(scenarios) <> 'array'
union all select 'move_estimates', id, 'a negative amount' from move_estimates where least(distance_miles, volume_cuft) < 0;
```

## Changing a table

1. Add a new file to `supabase/migrations/`, numbered after the highest one. Never edit a file that has been pushed.
2. Write it so it runs as written and can run twice: `IF NOT EXISTS`, `DROP ... IF EXISTS`, `CREATE OR REPLACE`. Put changes that must land together in one `DO` block, as 0025 and 0028 do. No grant to `anon` or `authenticated`. A new function needs `REVOKE ALL ... FROM PUBLIC, anon, authenticated` and, if it replaces one, its security settings repeated.
3. Make the same change in the table's row schema in `schemas/`. A new table also goes into `schemas/tables.ts` and gets a `user_id` column (`docs/security-lockdown.md`).
4. Run `pnpm db:check`. When it says `lib/supabase/types.ts` is out of date, regenerate it with the command it prints.
5. `supabase db push`.

## `pnpm db:check`

Builds the schema in a throwaway database on a PostgreSQL server on your own machine and checks it. It needs `psql` and a local server you may create databases on, and it refuses any other host. It:

- applies every migration twice, each file in one transaction;
- runs `supabase/tests/lockdown.sql` (the API roles reach nothing) and `supabase/tests/checks.sql` (the database refuses what the app refuses, and reordering keeps positions dense);
- runs `lib/supabase/schema-drift.test.ts` against it: every table's columns and which may be empty must equal the row schema, every list of allowed values must equal the schema's, the demo database's defaults must equal the column defaults, and `lib/supabase/types.ts` must equal what the generator prints.

`pnpm test` runs the same test without a database. That half is done by the type checker: a row schema and the generated types that disagree on a column are a type error.

## The generated types

`lib/supabase/types.ts` is written by `scripts/gen-db-types.mjs` from a database built from the migrations:

```
node scripts/gen-db-types.mjs "<local connection>" > lib/supabase/types.ts
```

It has the shape `supabase gen types typescript` writes. Use the script, because `pnpm db:check` compares the file with the script's output exactly.

A table's shape now lives in two hand-written places, the migration and the row schema, and the checks above hold them together. Columns checked against a list of values are plain text to the generated types. Narrow them with the schema, as `app/checklist/actions.ts` does.
