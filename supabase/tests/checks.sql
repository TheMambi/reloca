-- Rule check for migration 0028 (see docs/database.md).
--
-- Run it against a LOCAL database that has every migration applied, as the role
-- that ran them. Do not point it at the live project. scripts/db-check.sh runs it.
--   psql -X -v ON_ERROR_STOP=1 -f supabase/tests/checks.sql "<local connection>"
--
-- Part 1 tries each write the app's schemas would reject on read and fails
-- unless the database refuses it with a check violation. Part 2 moves checklist
-- tasks around, including across a hole left by a delete, and fails unless the
-- positions come out as 0, 1, 2, ... every time. Everything runs in one
-- transaction that is rolled back.

BEGIN;

DO $test$
DECLARE
  uid uuid := gen_random_uuid();
  lease uuid;
  walkthrough uuid;
  bad text;
  a uuid; c uuid; d uuid; l uuid;
  state text;
BEGIN
  INSERT INTO public.checklist_items (user_id, category, title, order_index) VALUES (uid, 'post-move', 'sample', 0);
  INSERT INTO public.lease_terms (user_id, property_name, unit_address, city, landlord_email, residents,
      lease_start_date, lease_end_date, current_monthly_rent)
    VALUES (uid, 'sample', 'sample', 'sample', 'sample', '[{"name": "sample"}]', '2025-01-01', '2025-12-31', 1)
    RETURNING id INTO lease;
  INSERT INTO public.destinations (user_id, building_name, street_address, city) VALUES (uid, 'sample', 'sample', 'sample');
  INSERT INTO public.insurance_policies (user_id, scope, property_label, liability_amount, personal_property_amount, effective_from)
    VALUES (uid, 'origin', 'sample', 1, 1, '2025-01-01');
  INSERT INTO public.utility_transitions (user_id, kind, side) VALUES (uid, 'gas', 'origin');
  INSERT INTO public.address_change_targets (user_id, kind, name) VALUES (uid, 'usps', 'sample');
  INSERT INTO public.move_estimates (user_id) VALUES (uid);
  INSERT INTO public.move_out_walkthroughs (user_id, lease_terms_id) VALUES (uid, lease) RETURNING id INTO walkthrough;
  INSERT INTO public.move_out_room_records (walkthrough_id, user_id, room_name) VALUES (walkthrough, uid, 'sample');

  -- Part 1. Each statement must be refused.
  FOREACH bad IN ARRAY ARRAY[
    'UPDATE public.checklist_items SET order_index = -7',
    'UPDATE public.utility_transitions SET order_index = -1',
    'UPDATE public.address_change_targets SET order_index = -1',
    'UPDATE public.move_out_room_records SET order_index = -1',
    'UPDATE public.lease_terms SET residents = ''[]''',
    'UPDATE public.lease_terms SET residents = ''{}''',
    'UPDATE public.lease_terms SET residents = ''"text"''',
    'UPDATE public.lease_terms SET current_monthly_rent = -5',
    'UPDATE public.lease_terms SET renewal_monthly_rent = -5',
    'UPDATE public.lease_terms SET security_deposit = -1',
    'UPDATE public.lease_terms SET notice_days_required = -1',
    'UPDATE public.lease_terms SET lease_end_date = ''1999-01-01''',
    'UPDATE public.destinations SET monthly_rent_low = -1',
    'UPDATE public.destinations SET insurance_min_property = -1',
    'UPDATE public.destinations SET walk_score = 101',
    'UPDATE public.destinations SET transit_score = -1',
    'UPDATE public.destinations SET bike_score = 500',
    'UPDATE public.insurance_policies SET liability_amount = -1',
    'UPDATE public.insurance_policies SET monthly_cost = -1',
    'UPDATE public.insurance_policies SET effective_to = ''2024-12-31''',
    'UPDATE public.move_estimates SET scenarios = ''{}''',
    'UPDATE public.move_estimates SET distance_miles = -1'
  ] LOOP
    BEGIN
      EXECUTE bad;
      RAISE EXCEPTION 'ACCEPTED: %', bad USING ERRCODE = 'P0001';
    EXCEPTION
      WHEN check_violation THEN NULL;
    END;
  END LOOP;

  -- Values the app accepts must still go in: empty optional amounts, an
  -- open-ended policy, a lease that ends the day it starts.
  UPDATE public.lease_terms SET renewal_monthly_rent = NULL, security_deposit = 0, lease_end_date = lease_start_date;
  UPDATE public.destinations SET walk_score = 100, transit_score = 0, bike_score = NULL, monthly_rent_low = 0;
  UPDATE public.insurance_policies SET effective_to = NULL, monthly_cost = NULL;
  UPDATE public.insurance_policies SET effective_to = effective_from;
  UPDATE public.move_estimates SET distance_miles = NULL, volume_cuft = 0;

  -- Part 2. Positions 0, 2, 3 in one phase: a row was deleted at 1.
  INSERT INTO public.checklist_items (user_id, category, title, order_index) VALUES (uid, 'pre-move', 'A', 0) RETURNING id INTO a;
  INSERT INTO public.checklist_items (user_id, category, title, order_index) VALUES (uid, 'pre-move', 'C', 2) RETURNING id INTO c;
  INSERT INTO public.checklist_items (user_id, category, title, order_index) VALUES (uid, 'pre-move', 'D', 3) RETURNING id INTO d;
  INSERT INTO public.checklist_items (user_id, category, title, order_index) VALUES (uid, 'lease', 'L', 0) RETURNING id INTO l;

  PERFORM public.reorder_checklist_item(c, 'pre-move', 2);
  SELECT string_agg(title || order_index, ' ' ORDER BY order_index) INTO state
    FROM public.checklist_items WHERE user_id = uid AND category = 'pre-move';
  IF state <> 'A0 D1 C2' THEN RAISE EXCEPTION 'move down across a hole gave %', state; END IF;

  PERFORM public.reorder_checklist_item(c, 'pre-move', 0);
  SELECT string_agg(title || order_index, ' ' ORDER BY order_index) INTO state
    FROM public.checklist_items WHERE user_id = uid AND category = 'pre-move';
  IF state <> 'C0 A1 D2' THEN RAISE EXCEPTION 'move up gave %', state; END IF;

  PERFORM public.reorder_checklist_item(c, 'pre-move', 0);
  SELECT string_agg(title || order_index, ' ' ORDER BY order_index) INTO state
    FROM public.checklist_items WHERE user_id = uid AND category = 'pre-move';
  IF state <> 'C0 A1 D2' THEN RAISE EXCEPTION 'moving to the same place gave %', state; END IF;

  PERFORM public.reorder_checklist_item(a, 'post-move', 0);
  SELECT string_agg(category || ':' || title || order_index, ' ' ORDER BY category, order_index) INTO state
    FROM public.checklist_items WHERE user_id = uid AND category <> 'lease';
  IF state <> 'post-move:A0 post-move:sample1 pre-move:C0 pre-move:D1' THEN
    RAISE EXCEPTION 'move to another phase gave %', state;
  END IF;

  PERFORM public.reorder_checklist_item(d, 'post-move', 99);
  SELECT string_agg(category || ':' || title || order_index, ' ' ORDER BY category, order_index) INTO state
    FROM public.checklist_items WHERE user_id = uid AND category <> 'lease';
  IF state <> 'post-move:A0 post-move:sample1 post-move:D2 pre-move:C0' THEN
    RAISE EXCEPTION 'move past the end gave %', state;
  END IF;

  BEGIN
    PERFORM public.reorder_checklist_item(l, 'pre-move', 0);
    RAISE EXCEPTION 'a lease task was moved' USING ERRCODE = 'P0002';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;
  BEGIN
    PERFORM public.reorder_checklist_item(c, 'lease', 0);
    RAISE EXCEPTION 'a task was moved into the lease group' USING ERRCODE = 'P0002';
  EXCEPTION WHEN raise_exception THEN NULL;
  END;

  IF EXISTS (SELECT 1 FROM public.checklist_items WHERE user_id = uid AND category = 'lease' AND order_index <> 0) THEN
    RAISE EXCEPTION 'the lease task changed position';
  END IF;
END
$test$;

ROLLBACK;

\echo 'PASS: the database refuses each bad write and reordering keeps positions dense.'
