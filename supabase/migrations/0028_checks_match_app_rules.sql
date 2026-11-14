-- Reloca migration 0028: the database refuses what the app refuses
--
-- The app checks every row it reads against its schemas (schemas/*.ts) and
-- stops the page when one fails. The tables accepted values those schemas
-- reject, so one write from outside the app (the SQL editor, a script) could
-- take a page down until the row was repaired by hand. This adds the same
-- rules as CHECK constraints: positions and amounts are not negative, scores
-- are 0 to 100, residents and scenarios are lists, end dates do not precede
-- start dates.
--
-- Not covered: the shape of an email address or a link, and what is inside
-- each resident or scenario. Those stay with the app.
--
-- reorder_checklist_item used to park rows at negative positions while it
-- renumbered. A CHECK is tested on every write, so it now parks them above
-- every position in use instead. The security settings are repeated because
-- CREATE OR REPLACE resets them.
--
-- Also drops idx_checklist_user_category, which covered the same columns as
-- the unique index idx_checklist_items_seedkey.
--
-- Run it exactly as written: there is no placeholder. The constraints are one
-- statement: if a row already breaks a rule, it stops, names the constraint and
-- changes no constraint. docs/database.md has a query that finds such rows
-- first. Running it again changes nothing.

DROP INDEX IF EXISTS public.idx_checklist_user_category;

CREATE OR REPLACE FUNCTION public.reorder_checklist_item(
  p_id uuid,
  p_target_category text,
  p_target_index int
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
STRICT
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_source_category text;
  v_dest_others int;
  v_base int;
  v_target int;
BEGIN
  IF p_target_category NOT IN ('pre-move', 'move-week', 'post-move') THEN
    RAISE EXCEPTION 'Invalid target category: %', p_target_category;
  END IF;

  IF p_target_index < 0 THEN
    RAISE EXCEPTION 'Target index must be non-negative, got %', p_target_index;
  END IF;

  SELECT user_id, category
    INTO v_user_id, v_source_category
  FROM checklist_items
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checklist item % not found', p_id;
  END IF;

  IF v_source_category = 'lease' THEN
    RAISE EXCEPTION 'Lease tasks cannot be reordered';
  END IF;

  -- No early return when the stored index already equals the target: with a
  -- hole in the numbering that is still a real move. A true no-op just writes
  -- the same order back.

  -- Clamp the target so the moved row always lands contiguously (a target past
  -- the end of the destination would otherwise leave a hole in [0, N)).
  SELECT count(*) INTO v_dest_others
  FROM checklist_items
  WHERE user_id = v_user_id AND category = p_target_category AND id <> p_id;
  v_target := least(p_target_index, v_dest_others);

  -- Every position from v_base up is unused by this user, and every final
  -- position is below it. The moved row parks at v_base, the others pass
  -- through v_base + 1, v_base + 2, ... so no two rows ever share a position.
  SELECT coalesce(max(order_index), 0) + count(*) + 1 INTO v_base
  FROM checklist_items
  WHERE user_id = v_user_id;

  UPDATE checklist_items SET order_index = v_base WHERE id = p_id;

  IF v_source_category = p_target_category THEN
    -- Same-category: renumber the others, leaving a gap at v_target.
    -- Pass 1: above v_base. Pass 2: final positions.
    WITH ord AS (
      SELECT id, (row_number() OVER (ORDER BY order_index) - 1) AS rn
      FROM checklist_items
      WHERE user_id = v_user_id AND category = v_source_category AND id <> p_id
    )
    UPDATE checklist_items c
    SET order_index = v_base + 1 + ord.rn
    FROM ord WHERE c.id = ord.id;

    WITH ord AS (
      SELECT id, (order_index - v_base - 1) AS rn
      FROM checklist_items
      WHERE user_id = v_user_id AND category = v_source_category AND id <> p_id
    )
    UPDATE checklist_items c
    SET order_index = CASE WHEN ord.rn < v_target THEN ord.rn ELSE ord.rn + 1 END
    FROM ord WHERE c.id = ord.id;
  ELSE
    -- Cross-category: close the gap in the source (dense), then open a gap at
    -- v_target in the destination. Each in the same two passes.
    WITH ord AS (
      SELECT id, (row_number() OVER (ORDER BY order_index) - 1) AS rn
      FROM checklist_items
      WHERE user_id = v_user_id AND category = v_source_category AND id <> p_id
    )
    UPDATE checklist_items c
    SET order_index = v_base + 1 + ord.rn
    FROM ord WHERE c.id = ord.id;

    WITH ord AS (
      SELECT id, (order_index - v_base - 1) AS rn
      FROM checklist_items
      WHERE user_id = v_user_id AND category = v_source_category AND id <> p_id
    )
    UPDATE checklist_items c
    SET order_index = ord.rn
    FROM ord WHERE c.id = ord.id;

    WITH ord AS (
      SELECT id, (row_number() OVER (ORDER BY order_index) - 1) AS rn
      FROM checklist_items
      WHERE user_id = v_user_id AND category = p_target_category AND id <> p_id
    )
    UPDATE checklist_items c
    SET order_index = v_base + 1 + ord.rn
    FROM ord WHERE c.id = ord.id;

    WITH ord AS (
      SELECT id, (order_index - v_base - 1) AS rn
      FROM checklist_items
      WHERE user_id = v_user_id AND category = p_target_category AND id <> p_id
    )
    UPDATE checklist_items c
    SET order_index = CASE WHEN ord.rn < v_target THEN ord.rn ELSE ord.rn + 1 END
    FROM ord WHERE c.id = ord.id;
  END IF;

  -- Place the moved row at its final position.
  UPDATE checklist_items
  SET category = p_target_category,
      order_index = v_target,
      updated_at = now()
  WHERE id = p_id;
END;
$$;

DO $checks$
BEGIN
  ALTER TABLE public.checklist_items
    DROP CONSTRAINT IF EXISTS checklist_items_order_index_check,
    ADD CONSTRAINT checklist_items_order_index_check CHECK (order_index >= 0);

  ALTER TABLE public.utility_transitions
    DROP CONSTRAINT IF EXISTS utility_transitions_order_index_check,
    ADD CONSTRAINT utility_transitions_order_index_check CHECK (order_index >= 0);

  ALTER TABLE public.address_change_targets
    DROP CONSTRAINT IF EXISTS address_change_targets_order_index_check,
    ADD CONSTRAINT address_change_targets_order_index_check CHECK (order_index >= 0);

  ALTER TABLE public.move_out_room_records
    DROP CONSTRAINT IF EXISTS move_out_room_records_order_index_check,
    ADD CONSTRAINT move_out_room_records_order_index_check CHECK (order_index >= 0);

  ALTER TABLE public.lease_terms
    DROP CONSTRAINT IF EXISTS lease_terms_residents_check,
    DROP CONSTRAINT IF EXISTS lease_terms_dates_check,
    DROP CONSTRAINT IF EXISTS lease_terms_amounts_check,
    -- The CASE keeps jsonb_array_length away from a value that is not a list.
    ADD CONSTRAINT lease_terms_residents_check CHECK (
      CASE WHEN jsonb_typeof(residents) = 'array'
           THEN jsonb_array_length(residents) >= 1
           ELSE false END),
    ADD CONSTRAINT lease_terms_dates_check CHECK (lease_end_date >= lease_start_date),
    ADD CONSTRAINT lease_terms_amounts_check CHECK (
      notice_days_required >= 0
      AND current_monthly_rent >= 0
      AND renewal_monthly_rent >= 0
      AND m2m_premium >= 0
      AND security_deposit >= 0
      AND pet_rent_monthly >= 0
      AND parking_monthly >= 0);

  ALTER TABLE public.destinations
    DROP CONSTRAINT IF EXISTS destinations_amounts_check,
    DROP CONSTRAINT IF EXISTS destinations_scores_check,
    ADD CONSTRAINT destinations_amounts_check CHECK (
      monthly_rent_low >= 0
      AND monthly_rent_high >= 0
      AND application_fee >= 0
      AND security_deposit >= 0
      AND pet_rent_monthly >= 0
      AND parking_monthly >= 0
      AND beds >= 0
      AND baths >= 0
      AND hud_fmr_2br >= 0
      AND insurance_min_liability >= 0
      AND insurance_min_property >= 0),
    ADD CONSTRAINT destinations_scores_check CHECK (
      walk_score BETWEEN 0 AND 100
      AND transit_score BETWEEN 0 AND 100
      AND bike_score BETWEEN 0 AND 100);

  ALTER TABLE public.insurance_policies
    DROP CONSTRAINT IF EXISTS insurance_policies_amounts_check,
    DROP CONSTRAINT IF EXISTS insurance_policies_dates_check,
    ADD CONSTRAINT insurance_policies_amounts_check CHECK (
      liability_amount >= 0
      AND personal_property_amount >= 0
      AND monthly_cost >= 0),
    ADD CONSTRAINT insurance_policies_dates_check CHECK (effective_to >= effective_from);

  ALTER TABLE public.move_estimates
    DROP CONSTRAINT IF EXISTS move_estimates_scenarios_check,
    DROP CONSTRAINT IF EXISTS move_estimates_amounts_check,
    ADD CONSTRAINT move_estimates_scenarios_check CHECK (jsonb_typeof(scenarios) = 'array'),
    ADD CONSTRAINT move_estimates_amounts_check CHECK (
      distance_miles >= 0
      AND volume_cuft >= 0);
END
$checks$;
