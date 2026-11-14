-- Test for docs/auth-draft.sql. A DRAFT like the file it tests.
--
-- Run it against a LOCAL database that has every migration and the draft
-- applied, as the role that ran them. Never point it at the hosted project.
--   psql -X -v ON_ERROR_STOP=1 -f docs/auth-draft-test.sql "<local connection>"
--
-- It creates two sign-in users with a row in every table each, then acts as
-- each kind of caller the way the REST API does (SET ROLE plus the claims of
-- the caller's token) and fails unless:
--   * a signed-in person reads, changes and deletes only their own rows,
--     cannot insert a row for someone else, cannot hang a row of their own
--     off someone else's lease, and can reorder only their own tasks;
--   * a signed-in role with no user in its token sees nothing;
--   * a visitor who is not signed in is refused everywhere;
--   * the server's service role still reaches everything.
-- Everything runs in one transaction that is rolled back.

BEGIN;

DO $test$
DECLARE
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  who uuid;
  lease_b uuid;
  lease_a uuid;
  task_a uuid;
  task_b uuid;
  walkthrough uuid;
  tbl text;
  n bigint;
BEGIN
  INSERT INTO auth.users (id) VALUES (a), (b);

  FOREACH who IN ARRAY ARRAY[a, b] LOOP
    INSERT INTO public.checklist_items (user_id, category, title, order_index) VALUES (who, 'pre-move', 'one', 0);
    INSERT INTO public.checklist_items (user_id, category, title, order_index) VALUES (who, 'pre-move', 'two', 1);
    INSERT INTO public.lease_terms (user_id, property_name, unit_address, city, landlord_email, residents,
        lease_start_date, lease_end_date, current_monthly_rent)
      VALUES (who, 'sample', 'sample', 'sample', 'sample', '[{"name": "sample"}]', '2025-01-01', '2025-12-31', 1)
      RETURNING id INTO lease_b;
    INSERT INTO public.lease_events (user_id, lease_id, kind, occurs_on) VALUES (who, lease_b, 'lease_end', '2025-12-31');
    INSERT INTO public.notice_drafts (user_id, lease_id, body_markdown, body_plaintext, subject_line, recipient_email, move_out_date)
      VALUES (who, lease_b, 'sample', 'sample', 'sample', 'sample', '2025-12-31');
    INSERT INTO public.destinations (user_id, building_name, street_address, city) VALUES (who, 'sample', 'sample', 'sample');
    INSERT INTO public.insurance_policies (user_id, scope, property_label, liability_amount, personal_property_amount, effective_from)
      VALUES (who, 'origin', 'sample', 1, 1, '2025-01-01');
    INSERT INTO public.utility_transitions (user_id, kind, side) VALUES (who, 'gas', 'origin');
    INSERT INTO public.address_change_targets (user_id, kind, name) VALUES (who, 'usps', 'sample');
    INSERT INTO public.move_estimates (user_id) VALUES (who);
    INSERT INTO public.move_out_walkthroughs (user_id, lease_terms_id) VALUES (who, lease_b) RETURNING id INTO walkthrough;
    INSERT INTO public.move_out_room_records (walkthrough_id, user_id, room_name) VALUES (walkthrough, who, 'sample');
    INSERT INTO public.saved_neighborhoods (user_id, neighborhood, city) VALUES (who, 'sample', 'sample');
    INSERT INTO public.relocations (user_id, label, origin_slug, destination_slug) VALUES (who, 'sample', 'a', 'b');
    IF who = a THEN lease_a := lease_b; END IF;
  END LOOP;
  SELECT id INTO task_a FROM public.checklist_items WHERE user_id = a AND order_index = 0;
  SELECT id INTO task_b FROM public.checklist_items WHERE user_id = b AND order_index = 0;

  -- A table the rows above do not cover would pass every check below unseen.
  FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1 LOOP
    EXECUTE format('SELECT count(DISTINCT user_id) FROM public.%I WHERE user_id IN ($1, $2)', tbl) INTO n USING a, b;
    IF n <> 2 THEN RAISE EXCEPTION 'Table % has no row for both test users. Add one at the top of this file.', tbl; END IF;
  END LOOP;

  -- Signed in as A.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  IF (SELECT auth.uid()) IS DISTINCT FROM a THEN RAISE EXCEPTION 'auth.uid() did not return the signed-in user'; END IF;

  FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1 LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id <> $1', tbl) INTO n USING a;
    IF n <> 0 THEN RAISE EXCEPTION 'A can read % row(s) of another user in %', n, tbl; END IF;
    EXECUTE format('SELECT count(*) FROM public.%I', tbl) INTO n;
    IF n = 0 THEN RAISE EXCEPTION 'A cannot read their own rows in %', tbl; END IF;

    EXECUTE format('UPDATE public.%I SET user_id = user_id WHERE user_id = $1', tbl) USING b;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'A changed % row(s) of another user in %', n, tbl; END IF;

    BEGIN
      EXECUTE format('UPDATE public.%I SET user_id = $1', tbl) USING b;
      RAISE EXCEPTION 'A gave their rows in % to another user', tbl USING ERRCODE = 'P0002';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;

  BEGIN
    INSERT INTO public.relocations (user_id, label, origin_slug, destination_slug) VALUES (b, 'planted', 'a', 'b');
    RAISE EXCEPTION 'A inserted a row for another user' USING ERRCODE = 'P0002';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  INSERT INTO public.relocations (user_id, label, origin_slug, destination_slug) VALUES (a, 'mine', 'a', 'b');

  BEGIN
    INSERT INTO public.lease_events (user_id, lease_id, kind, occurs_on) VALUES (a, lease_b, 'walkthrough', '2025-12-31');
    RAISE EXCEPTION 'A attached an event to another user''s lease' USING ERRCODE = 'P0002';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  INSERT INTO public.lease_events (user_id, lease_id, kind, occurs_on) VALUES (a, lease_a, 'walkthrough', '2025-12-31');

  PERFORM public.reorder_checklist_item(task_a, 'pre-move', 1);
  IF (SELECT order_index FROM public.checklist_items WHERE id = task_a) <> 1 THEN
    RAISE EXCEPTION 'A could not reorder their own task';
  END IF;
  BEGIN
    PERFORM public.reorder_checklist_item(task_b, 'pre-move', 1);
    RAISE EXCEPTION 'A reordered another user''s task' USING ERRCODE = 'P0002';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;

  FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1 LOOP
    EXECUTE format('DELETE FROM public.%I WHERE user_id = $1', tbl) USING b;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n <> 0 THEN RAISE EXCEPTION 'A deleted % row(s) of another user in %', n, tbl; END IF;
  END LOOP;
  RESET ROLE;

  IF (SELECT order_index FROM public.checklist_items WHERE id = task_b) <> 0 THEN
    RAISE EXCEPTION 'another user''s task moved';
  END IF;

  -- The signed-in role with no user in the token.
  PERFORM set_config('request.jwt.claims', '{"role": "authenticated"}', true);
  SET LOCAL ROLE authenticated;
  FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1 LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', tbl) INTO n;
    IF n <> 0 THEN RAISE EXCEPTION 'a token with no user reads % row(s) in %', n, tbl; END IF;
  END LOOP;
  RESET ROLE;

  -- Not signed in.
  PERFORM set_config('request.jwt.claims', '{"role": "anon"}', true);
  SET LOCAL ROLE anon;
  FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1 LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I', tbl) INTO n;
      RAISE EXCEPTION 'a visitor who is not signed in can read %', tbl USING ERRCODE = 'P0002';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
  BEGIN
    PERFORM public.reorder_checklist_item(task_b, 'pre-move', 1);
    RAISE EXCEPTION 'a visitor who is not signed in ran reorder_checklist_item' USING ERRCODE = 'P0002';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET ROLE;

  -- The server's role, for scripts that still use it.
  SET LOCAL ROLE service_role;
  FOR tbl IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1 LOOP
    EXECUTE format('SELECT count(DISTINCT user_id) FROM public.%I WHERE user_id IN ($1, $2)', tbl) INTO n USING a, b;
    IF n <> 2 THEN RAISE EXCEPTION 'service_role no longer reads every row in %', tbl; END IF;
  END LOOP;
  RESET ROLE;
END
$test$;

ROLLBACK;

\echo 'PASS: each signed-in user reaches only their own rows, and a visitor who is not signed in reaches nothing.'
