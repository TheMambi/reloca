-- Access check for migration 0025 (see docs/security-lockdown.md).
--
-- Run it against a LOCAL database that has every migration applied, as the role
-- that ran them. Do not point it at the live project.
--   psql -X -v ON_ERROR_STOP=1 -f supabase/tests/lockdown.sql "<local connection>"
--
-- It becomes each API role the way the REST API does (SET ROLE), tries to read,
-- insert, update and delete in every table and to call the reorder function,
-- prints what happened, and fails unless anon and authenticated are refused
-- everywhere and service_role succeeds everywhere. Everything runs in one
-- transaction that is rolled back.

BEGIN;

CREATE TEMP TABLE lockdown_result (
  role_name text, object_name text, action text, outcome text, row_count bigint
) ON COMMIT DROP;

DO $test$
DECLARE
  uid uuid := gen_random_uuid();
  task uuid;
  lease uuid;
  walkthrough uuid;
  role_name text;
  tbl text;
  action text;
  sample jsonb;
  n bigint;
  outcome text;
  kept text;
BEGIN
  -- One row per table, so service_role has something to read, change and delete.
  INSERT INTO public.checklist_items (user_id, category, title, order_index)
    VALUES (uid, 'pre-move', 'sample', 0) RETURNING id INTO task;
  INSERT INTO public.checklist_items (user_id, category, title, order_index)
    VALUES (uid, 'pre-move', 'sample two', 1);
  INSERT INTO public.lease_terms (user_id, property_name, unit_address, city, landlord_email, residents,
      lease_start_date, lease_end_date, current_monthly_rent)
    VALUES (uid, 'sample', 'sample', 'sample', 'sample', '[{"name": "sample"}]', '2025-01-01', '2025-12-31', 1) RETURNING id INTO lease;
  INSERT INTO public.lease_events (user_id, lease_id, kind, occurs_on) VALUES (uid, lease, 'lease_end', '2025-12-31');
  INSERT INTO public.notice_drafts (user_id, lease_id, body_markdown, body_plaintext, subject_line, recipient_email, move_out_date)
    VALUES (uid, lease, 'sample', 'sample', 'sample', 'sample', '2025-12-31');
  INSERT INTO public.destinations (user_id, building_name, street_address, city) VALUES (uid, 'sample', 'sample', 'sample');
  INSERT INTO public.insurance_policies (user_id, scope, property_label, liability_amount, personal_property_amount, effective_from)
    VALUES (uid, 'origin', 'sample', 1, 1, '2025-01-01');
  INSERT INTO public.utility_transitions (user_id, kind, side) VALUES (uid, 'gas', 'origin');
  INSERT INTO public.address_change_targets (user_id, kind, name) VALUES (uid, 'usps', 'sample');
  INSERT INTO public.move_estimates (user_id) VALUES (uid);
  INSERT INTO public.move_out_walkthroughs (user_id, lease_terms_id) VALUES (uid, lease) RETURNING id INTO walkthrough;
  INSERT INTO public.move_out_room_records (walkthrough_id, user_id, room_name) VALUES (walkthrough, uid, 'sample');
  INSERT INTO public.saved_neighborhoods (user_id, neighborhood, city) VALUES (uid, 'sample', 'sample');
  INSERT INTO public.relocations (user_id, label, origin_slug, destination_slug) VALUES (uid, 'sample', 'a', 'b');

  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1 LOOP
      -- A copy of an existing row under a new id and owner, to insert as the role.
      EXECUTE format(
        'SELECT to_jsonb(s) || jsonb_build_object(''id'', gen_random_uuid(), ''user_id'', gen_random_uuid()) FROM public.%I s LIMIT 1',
        tbl) INTO sample;
      IF sample IS NULL THEN
        RAISE EXCEPTION 'Table % has no row to test with. Add one at the top of this file.', tbl;
      END IF;
      FOREACH action IN ARRAY ARRAY['select', 'insert', 'update', 'delete'] LOOP
        BEGIN
          EXECUTE format('SET LOCAL ROLE %I', role_name);
          CASE action
            WHEN 'select' THEN
              EXECUTE format('SELECT count(*) FROM public.%I', tbl) INTO n;
            WHEN 'insert' THEN
              EXECUTE format('INSERT INTO public.%1$I SELECT * FROM jsonb_populate_record(NULL::public.%1$I, $1)', tbl) USING sample;
              GET DIAGNOSTICS n = ROW_COUNT;
            WHEN 'update' THEN
              EXECUTE format('UPDATE public.%I SET user_id = gen_random_uuid()', tbl);
              GET DIAGNOSTICS n = ROW_COUNT;
            WHEN 'delete' THEN
              EXECUTE format('DELETE FROM public.%I', tbl);
              GET DIAGNOSTICS n = ROW_COUNT;
          END CASE;
          -- Leaving through an error undoes the statement and the role change. The count rides along.
          RAISE EXCEPTION USING ERRCODE = 'RL001', MESSAGE = n::text;
        EXCEPTION
          WHEN SQLSTATE 'RL001' THEN
            outcome := 'ok';
            n := SQLERRM::bigint;
          WHEN insufficient_privilege THEN
            outcome := 'refused';
            n := NULL;
        END;
        INSERT INTO lockdown_result VALUES (role_name, tbl, action, outcome, n);
      END LOOP;
      -- The old policies also refused these test rows, so "refused" alone could
      -- hide a grant. Ask the catalog as well.
      INSERT INTO lockdown_result VALUES (role_name, tbl, 'grants',
        CASE WHEN has_table_privilege(role_name, format('public.%I', tbl), 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
          THEN 'held' ELSE 'none' END, NULL);
    END LOOP;

    BEGIN
      EXECUTE format('SET LOCAL ROLE %I', role_name);
      PERFORM public.reorder_checklist_item(task, 'pre-move', 1);
      RAISE EXCEPTION USING ERRCODE = 'RL001', MESSAGE = '1';
    EXCEPTION
      WHEN SQLSTATE 'RL001' THEN outcome := 'ok';
      WHEN insufficient_privilege THEN outcome := 'refused';
    END;
    INSERT INTO lockdown_result VALUES (role_name, 'reorder_checklist_item()', 'call', outcome, NULL);
  END LOOP;

  -- A NULL argument returns at once and leaves the row alone.
  BEGIN
    SET LOCAL ROLE service_role;
    PERFORM public.reorder_checklist_item(task, NULL, 0);
    SELECT category INTO kept FROM public.checklist_items WHERE id = task;
    outcome := CASE WHEN kept = 'pre-move' THEN 'ok' ELSE 'row changed' END;
  EXCEPTION
    WHEN OTHERS THEN outcome := 'error';
  END;
  RESET ROLE;
  INSERT INTO lockdown_result VALUES ('service_role', 'reorder_checklist_item()', 'null argument', outcome, NULL);

  -- A table created after the migration, by the role that ran it, starts closed.
  CREATE TABLE public.lockdown_probe (id int);
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    INSERT INTO lockdown_result VALUES (role_name, '(a table created later)', 'grants',
      CASE WHEN has_table_privilege(role_name, 'public.lockdown_probe', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
        THEN 'held' ELSE 'none' END, NULL);
  END LOOP;
END
$test$;

SELECT role_name AS role, object_name AS object,
       max(outcome) FILTER (WHERE action = 'select') AS "select",
       max(outcome) FILTER (WHERE action = 'insert') AS "insert",
       max(outcome) FILTER (WHERE action = 'update') AS "update",
       max(outcome) FILTER (WHERE action = 'delete') AS "delete",
       max(outcome) FILTER (WHERE action = 'grants') AS grants,
       max(outcome) FILTER (WHERE action = 'call') AS call,
       max(outcome) FILTER (WHERE action = 'null argument') AS null_argument
FROM lockdown_result
GROUP BY role_name, object_name
ORDER BY role_name, object_name;

DO $verdict$
DECLARE
  wrong text;
BEGIN
  SELECT string_agg(format('%s %s on %s: %s', role_name, action, object_name, outcome), '; ')
    INTO wrong
  FROM lockdown_result
  WHERE CASE
    WHEN role_name = 'service_role' THEN outcome NOT IN ('ok', 'held') OR row_count = 0
    ELSE outcome NOT IN ('refused', 'none')
  END;
  IF wrong IS NOT NULL THEN
    RAISE EXCEPTION 'Lockdown check failed: %', wrong;
  END IF;
  RAISE NOTICE 'Lockdown check passed: % results', (SELECT count(*) FROM lockdown_result);
END
$verdict$;

ROLLBACK;
