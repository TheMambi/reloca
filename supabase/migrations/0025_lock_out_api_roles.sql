-- Reloca migration 0025: lock the anon and authenticated roles out of the database
--
-- Until this migration every table granted read and write to `anon` and
-- `authenticated`, and the single_user_* policies compared user_id with a fixed
-- UUID without looking at who was calling. Anyone holding the project URL and
-- the anon key could read, change and delete every row through the REST API
-- without going near the app.
--
-- After it, only the server reaches the data. It connects with the service-role
-- key (lib/supabase/server.ts) and filters every query by user_id in code. The
-- anon key opens nothing.
--
-- Deploy that code BEFORE running this. docs/security-lockdown.md has the
-- order, the two checks to run afterwards and the SQL that undoes this.
--
-- Run it exactly as written: there is no placeholder to replace. It is a single
-- statement, so it applies completely or not at all, and running it again
-- changes nothing.

DO $lockdown$
DECLARE
  item record;
  leftover text;
BEGIN
  -- Once the policies are gone, the server's role reads only because it skips
  -- row level security. Stop before changing anything if it cannot.
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role' AND rolbypassrls) THEN
    RAISE EXCEPTION 'service_role is missing or cannot bypass row level security. Nothing was changed.';
  END IF;

  -- 1. No table or view privileges for the public API roles.
  REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;

  -- 2. The policies never checked the caller, so they go. Row level security
  --    stays on: with no policy, anon and authenticated are refused even if a
  --    grant ever comes back.
  FOR item IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND policyname LIKE 'single\_user\_%'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', item.policyname, item.tablename);
  END LOOP;

  FOR item IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', item.relname);
  END LOOP;

  -- 3. The reorder function ran with its owner's rights for anyone who called
  --    it. Only the server may call it now, and it runs with the caller's own
  --    rights, so a returning grant cannot make it a way around the tables.
  --    STRICT: a NULL argument returns at once instead of failing halfway with
  --    an error that prints the row.
  REVOKE ALL ON FUNCTION public.reorder_checklist_item(uuid, text, integer)
    FROM PUBLIC, anon, authenticated;
  ALTER FUNCTION public.reorder_checklist_item(uuid, text, integer)
    SECURITY INVOKER STRICT;

  -- 4. What the server's role needs.
  GRANT USAGE ON SCHEMA public TO service_role;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
  GRANT EXECUTE ON FUNCTION public.reorder_checklist_item(uuid, text, integer) TO service_role;

  -- 5. Supabase gives the API roles full access to every new table by default.
  --    Tables created from now on by the role running this start closed.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;

  -- 6. Check the result from the database's own point of view. If anything is
  --    still reachable, fail, which undoes every step above.
  SELECT string_agg(format('%s on %I', r.rolname, c.relname), ', ')
    INTO leftover
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND (has_table_privilege(r.rolname, c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
      OR has_any_column_privilege(r.rolname, c.oid, 'SELECT, INSERT, UPDATE, REFERENCES'));
  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION 'Lockdown incomplete, nothing was changed. Still has table access: %', leftover;
  END IF;

  SELECT string_agg(c.relname, ', ')
    INTO leftover
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity;
  IF leftover IS NOT NULL THEN
    RAISE EXCEPTION 'Lockdown incomplete, nothing was changed. Row level security is off on: %', leftover;
  END IF;

  IF has_function_privilege('anon', 'public.reorder_checklist_item(uuid, text, integer)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.reorder_checklist_item(uuid, text, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Lockdown incomplete, nothing was changed. anon or authenticated can still run reorder_checklist_item.';
  END IF;
END
$lockdown$;
