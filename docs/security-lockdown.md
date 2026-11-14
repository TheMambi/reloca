# Database lockdown (migration 0025)

Before this change every table granted read and write to the `anon` and `authenticated` roles, and the `single_user_*` policies compared `user_id` with a fixed UUID without checking who was calling. Anyone holding the project URL and the anon key could read, change and delete every row through Supabase's REST API, without going near the app or its login wall.

After it, only the server reaches the data:

- The server connects with the service role key (`lib/supabase/server.ts`). That key is a server secret.
- `supabase/migrations/0025_lock_out_api_roles.sql` revokes every table privilege from `anon` and `authenticated`, drops the `single_user_*` policies, keeps row level security on, and limits `reorder_checklist_item` to the server.
- The anon key is not read anywhere and opens nothing.
- `RELOCA_SINGLE_USER_ID` is an identifier the server adds to every query. It is not a secret.

This is containment, not a login. Whoever can open a private deployment can still use the app. Real sign-in is the next step.

## Rollout order

Do the steps in this order. The new code works against the database both before and after the migration, because the service role key does not depend on the grants to `anon` or on the policies. The old code stops working the moment the migration runs, so the migration must come second.

1. **Settings.** On the hosting project that runs on the real database, confirm `SUPABASE_SERVICE_ROLE_KEY` and `RELOCA_SINGLE_USER_ID` are set for every environment that deploys, and add `SUPABASE_URL` with the project URL. The older `NEXT_PUBLIC_SUPABASE_URL` is still read while `SUPABASE_URL` is empty, so nothing breaks if you add it later.
2. **Deploy the code.** Open every page and save one change. Everything should behave as before.
3. **Run migration 0025** in the Supabase SQL editor, exactly as written. It has no placeholder. It is one statement: it applies completely or changes nothing, and it stops with a message if something would be left open. Running it twice is safe.
4. **Run the two checks** below, then open the app again.
5. **Remove `NEXT_PUBLIC_SUPABASE_ANON_KEY`** from the hosting settings and from `.env.local`. Once `SUPABASE_URL` is set, `NEXT_PUBLIC_SUPABASE_URL` can go too.

If the deployed app is built from another copy of this code, the change protects nothing until that copy has the same code and the live database has had the migration.

## The two checks

Run both in the SQL editor after step 3. They only read.

Check 1: what the public API roles can still reach. It must return no rows.

```sql
select r.rolname as role, 'table ' || c.relname as can_still_reach
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join (values ('anon'), ('authenticated')) as r(rolname)
where n.nspname = 'public'
  and c.relkind in ('r', 'p', 'v', 'm', 'f')
  and (has_table_privilege(r.rolname, c.oid, 'select, insert, update, delete, truncate, references, trigger')
    or has_any_column_privilege(r.rolname, c.oid, 'select, insert, update, references'))
union all
select r.rolname, 'function ' || p.oid::regprocedure::text
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join (values ('anon'), ('authenticated')) as r(rolname)
where n.nspname = 'public'
  and p.prorettype <> 'trigger'::regtype
  and has_function_privilege(r.rolname, p.oid, 'execute');
```

Check 2: every table is still protected and the old policies are gone. Every row must show `row_level_security` true and `policies` 0.

```sql
select c.relname as table_name,
       c.relrowsecurity as row_level_security,
       count(p.policyname) as policies,
       coalesce(string_agg(p.policyname, ', '), '') as policy_names
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p on p.schemaname = n.nspname and p.tablename = c.relname
where n.nspname = 'public' and c.relkind in ('r', 'p')
group by c.relname, c.relrowsecurity
order by c.relname;
```

From outside, a request to `/rest/v1/lease_terms?select=id` on the project URL with the old anon key must now answer with a permission error and no rows.

`supabase/tests/lockdown.sql` proves the same thing on a local database by acting as each role against every table. It is for local use only.

## How rows stay inside one user now

The service role key skips row level security, so the database no longer filters anything for the app. The code does:

- Every read, update and delete carries `.eq("user_id", requireUserId())`. Every insert sets `user_id`.
- All 13 tables have their own `user_id` column, the child tables included (`lease_events`, `notice_drafts`, `move_out_room_records`), so each is filtered directly, together with its parent id where it has one. No table is scoped through a parent today.
- A table added later without a `user_id` column must be reached through its parent only: read the parent row with its id and the user filter, stop if it is not found, then query the child by that parent's id. The scope test refuses such a table until that rule is written into it.
- An insert into a child table sets `user_id` but takes the parent id it is given. With one user there is no other parent to attach to. Check the parent first before a second user exists.
- `reorder_checklist_item` finds its row by id alone. The action reads the row with the user filter first and only then calls it.

`lib/supabase/user-scope.test.ts` enforces this. It runs every data loader and server action against a stand-in for the REST API that holds a second user's rows and refuses any request without the user's id. A new file that uses the database client, or a new exported loader or action, fails the test until it is added there.

## Keeping it closed

- Re-running any of migrations 0001 to 0024 grants access to `anon` again and recreates the policies. Run 0025 again afterwards.
- A new table needs `ENABLE ROW LEVEL SECURITY`, a `user_id` column, and a grant to `service_role` only. Tables created by the role that ran 0025 no longer get grants to `anon` or `authenticated` by default. Tables created by another role still might, so run check 1 after adding one.
- A new function is runnable by everyone by default in Postgres. Give it `REVOKE ALL ON FUNCTION ... FROM PUBLIC` and grant it to `service_role`.
- `scripts/keepalive.sh` uses the service role key from `.env.local`, since the anon key can no longer read a table.

## Undo

This reopens the database to anyone with the anon key. Use it only to get an old deployment working again while you fix forward, and run 0025 again as soon as the new code is live. It reads the user id from the data, so it also needs no placeholder.

```sql
DO $undo$
DECLARE
  uid uuid;
  tbl text;
BEGIN
  SELECT user_id INTO uid FROM public.checklist_items LIMIT 1;
  IF uid IS NULL THEN
    RAISE EXCEPTION 'checklist_items is empty, so there is no user id to rebuild the policies from.';
  END IF;

  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
  FOR tbl IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'user_id'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS single_user_select ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS single_user_insert ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS single_user_update ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS single_user_delete ON public.%I', tbl);
    EXECUTE format('CREATE POLICY single_user_select ON public.%I FOR SELECT USING (user_id = %L::uuid)', tbl, uid);
    EXECUTE format('CREATE POLICY single_user_insert ON public.%I FOR INSERT WITH CHECK (user_id = %L::uuid)', tbl, uid);
    EXECUTE format('CREATE POLICY single_user_update ON public.%I FOR UPDATE USING (user_id = %L::uuid) WITH CHECK (user_id = %L::uuid)', tbl, uid, uid);
    EXECUTE format('CREATE POLICY single_user_delete ON public.%I FOR DELETE USING (user_id = %L::uuid)', tbl, uid);
  END LOOP;

  ALTER FUNCTION public.reorder_checklist_item(uuid, text, integer) SECURITY DEFINER CALLED ON NULL INPUT;
  GRANT EXECUTE ON FUNCTION public.reorder_checklist_item(uuid, text, integer) TO anon, authenticated;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
END
$undo$;
```
