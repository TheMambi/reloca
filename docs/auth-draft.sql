-- DRAFT. NOT APPLIED TO ANY DATABASE. DO NOT RUN YET.
--
-- This is the database half of real sign-in, written ahead of time. It lives
-- under docs/ and not under supabase/migrations/ so that no tool applies it by
-- accident. docs/auth-design.md explains what it is for, the order of the
-- rollout, and what has to be true before it becomes a numbered migration.
-- It was tried only on a throwaway local PostgreSQL 16 with a stand-in for
-- Supabase's auth schema.
--
-- What it does, as one statement that applies completely or not at all:
--
--   1. Stops unless every stored row already belongs to a sign-in user.
--   2. Ties every user_id to auth.users, and every child row to a parent row
--      of the same user.
--   3. Gives the `authenticated` role (a signed-in person) the four table
--      privileges, with one policy per action that lets a person reach only
--      rows whose user_id is their own. `anon` (a visitor who is not signed
--      in) still gets nothing.
--   4. Lets a signed-in person call reorder_checklist_item. The function runs
--      with the caller's rights, so the same policies apply inside it.
--   5. Checks the result and fails, undoing everything, if anything is off.
--
-- The server's service role keeps its access throughout, so the app that runs
-- today is not affected by this statement. There is no placeholder and no user
-- id in this file. Running it twice changes nothing.

DO $signin$
DECLARE
  tbl text;
  n bigint;
  child record;
  leftover text;
BEGIN
  -- 1. Every row must already belong to a sign-in user. The rollout creates
  --    that user with the id the rows already carry, so no row is rewritten.
  IF NOT EXISTS (SELECT 1 FROM auth.users) THEN
    RAISE EXCEPTION 'There is no sign-in user yet. Create one first (docs/auth-design.md). Nothing was changed.';
  END IF;
  FOR tbl IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t USING (table_schema, table_name)
    WHERE c.table_schema = 'public' AND c.column_name = 'user_id' AND t.table_type = 'BASE TABLE'
    ORDER BY 1
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM public.%I t WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = t.user_id)', tbl)
      INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION '% row(s) in % belong to no sign-in user. Nothing was changed.', n, tbl;
    END IF;
  END LOOP;

  -- A table without user_id has no owner to write a policy for.
  SELECT string_agg(t.table_name, ', ') INTO leftover
  FROM information_schema.tables t
  WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns c
                    WHERE c.table_schema = 'public' AND c.table_name = t.table_name AND c.column_name = 'user_id');
  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION 'No user_id column on: %. Decide how each is scoped first. Nothing was changed.', leftover;
  END IF;

  -- 2a. user_id names a real sign-in user. No ON DELETE action: deleting the
  --     user while rows exist is refused, so one click in the dashboard cannot
  --     erase the data.
  FOR tbl IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'user_id' ORDER BY 1
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', tbl, tbl || '_user_id_fkey');
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (user_id) REFERENCES auth.users (id)',
      tbl, tbl || '_user_id_fkey');
  END LOOP;

  -- 2b. A child row must hang off a parent of the same user. Foreign keys are
  --     checked without regard to policies, so without this a signed-in person
  --     could attach a row of their own to another person's lease. The
  --     existing single-column keys stay and keep doing the cascading.
  FOR tbl IN SELECT unnest(ARRAY['lease_terms', 'move_out_walkthroughs', 'relocations']) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                   WHERE conrelid = format('public.%I', tbl)::regclass AND conname = tbl || '_id_user_id_key') THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I UNIQUE (id, user_id)', tbl, tbl || '_id_user_id_key');
    END IF;
  END LOOP;
  FOR child IN
    SELECT * FROM (VALUES
      ('lease_events',          'lease_id',       'lease_terms'),
      ('notice_drafts',         'lease_id',       'lease_terms'),
      ('move_out_walkthroughs', 'lease_terms_id', 'lease_terms'),
      ('move_out_room_records', 'walkthrough_id', 'move_out_walkthroughs'),
      ('destinations',          'relocation_id',  'relocations'),
      ('saved_neighborhoods',   'relocation_id',  'relocations')
    ) AS v(child_table, child_column, parent_table)
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I',
      child.child_table, child.child_table || '_same_owner_fkey');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I, user_id) REFERENCES public.%I (id, user_id)',
      child.child_table, child.child_table || '_same_owner_fkey', child.child_column, child.parent_table);
  END LOOP;

  -- 3. A signed-in person reaches their own rows and nothing else.
  --    (select auth.uid()) is evaluated once per statement, not once per row.
  FOR tbl IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'user_id' ORDER BY 1
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS owner_select ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS owner_insert ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS owner_update ON public.%I', tbl);
    EXECUTE format('DROP POLICY IF EXISTS owner_delete ON public.%I', tbl);
    EXECUTE format('CREATE POLICY owner_select ON public.%I FOR SELECT TO authenticated USING (user_id = (select auth.uid()))', tbl);
    EXECUTE format('CREATE POLICY owner_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()))', tbl);
    EXECUTE format('CREATE POLICY owner_update ON public.%I FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()))', tbl);
    EXECUTE format('CREATE POLICY owner_delete ON public.%I FOR DELETE TO authenticated USING (user_id = (select auth.uid()))', tbl);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl);
  END LOOP;
  GRANT USAGE ON SCHEMA public TO authenticated;

  -- 4. The reorder function runs with the caller's rights (0025, 0027, 0028),
  --    so inside it a signed-in person sees and moves only their own tasks.
  GRANT EXECUTE ON FUNCTION public.reorder_checklist_item(uuid, text, integer) TO authenticated;

  -- 5. Check the result from the database's own point of view.
  SELECT string_agg(c.relname, ', ') INTO leftover
  FROM pg_class c
  JOIN pg_namespace ns ON ns.oid = c.relnamespace
  WHERE ns.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND (has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
      OR has_any_column_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, REFERENCES'));
  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION 'A visitor who is not signed in can reach: %. Nothing was changed.', leftover;
  END IF;

  IF has_function_privilege('anon', 'public.reorder_checklist_item(uuid, text, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'A visitor who is not signed in can run reorder_checklist_item. Nothing was changed.';
  END IF;

  -- Every table: row level security on, and no policy except the four above.
  -- Any other policy could widen access, because policies add up.
  SELECT string_agg(c.relname, ', ') INTO leftover
  FROM pg_class c
  JOIN pg_namespace ns ON ns.oid = c.relnamespace
  WHERE ns.nspname = 'public' AND c.relkind IN ('r', 'p')
    AND (NOT c.relrowsecurity
      OR (SELECT count(*) FROM pg_policies p
          WHERE p.schemaname = 'public' AND p.tablename = c.relname
            AND p.policyname IN ('owner_select', 'owner_insert', 'owner_update', 'owner_delete')
            AND p.roles = '{authenticated}') <> 4
      OR EXISTS (SELECT 1 FROM pg_policies p
          WHERE p.schemaname = 'public' AND p.tablename = c.relname
            AND p.policyname NOT IN ('owner_select', 'owner_insert', 'owner_update', 'owner_delete')));
  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION 'Policies are not as expected on: %. Nothing was changed.', leftover;
  END IF;
END
$signin$;
