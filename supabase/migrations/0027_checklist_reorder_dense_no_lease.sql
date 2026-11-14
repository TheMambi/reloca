-- Reloca migration 0027: checklist reorder that survives holes and refuses lease tasks
--
-- Two faults in the 0024 function:
--
-- 1. It returned early when the row's stored order_index equalled the target
--    index. The target is a position in a dense list (0, 1, 2, ...), but stored
--    indexes get holes when a row is deleted. With rows at 0, 2, 3, moving the
--    middle row to the end asks for index 2, the function saw "already at 2"
--    and did nothing. The early return is gone: the renumber always runs, and
--    it closes any hole in the category as it goes.
--
-- 2. It accepted 'lease' as a target and never looked at the source category,
--    so a task could be moved into the lease group or a lease task pulled out.
--    Both now raise.
--
-- The signature is unchanged, so the app works with either version. The
-- security settings from 0025 are repeated here because CREATE OR REPLACE
-- resets them: the function runs with the caller's rights, returns at once on
-- a NULL argument, and only the server's role may call it. An existing
-- function keeps its grants, so this does not reopen it.
--
-- Run it exactly as written: there is no placeholder. Running it again
-- changes nothing.

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

  -- Park the moved row at -1 so the renumber passes can't collide with it.
  UPDATE checklist_items SET order_index = -1 WHERE id = p_id;

  IF v_source_category = p_target_category THEN
    -- Same-category: renumber the others, leaving a gap at v_target.
    -- Pass 1 → disjoint negatives (-2, -3, …); pass 2 → final positives.
    WITH ord AS (
      SELECT id, (row_number() OVER (ORDER BY order_index) - 1) AS rn
      FROM checklist_items
      WHERE user_id = v_user_id AND category = v_source_category AND id <> p_id
    )
    UPDATE checklist_items c
    SET order_index = -2 - ord.rn
    FROM ord WHERE c.id = ord.id;

    WITH ord AS (
      SELECT id, (-order_index - 2) AS rn
      FROM checklist_items
      WHERE user_id = v_user_id AND category = v_source_category AND id <> p_id
    )
    UPDATE checklist_items c
    SET order_index = CASE WHEN ord.rn < v_target THEN ord.rn ELSE ord.rn + 1 END
    FROM ord WHERE c.id = ord.id;
  ELSE
    -- Cross-category: close the gap in the source (dense), then open a gap at
    -- v_target in the destination. Each via the same negative-dump technique.
    WITH ord AS (
      SELECT id, (row_number() OVER (ORDER BY order_index) - 1) AS rn
      FROM checklist_items
      WHERE user_id = v_user_id AND category = v_source_category AND id <> p_id
    )
    UPDATE checklist_items c
    SET order_index = -2 - ord.rn
    FROM ord WHERE c.id = ord.id;

    WITH ord AS (
      SELECT id, (-order_index - 2) AS rn
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
    SET order_index = -2 - ord.rn
    FROM ord WHERE c.id = ord.id;

    WITH ord AS (
      SELECT id, (-order_index - 2) AS rn
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

REVOKE ALL ON FUNCTION public.reorder_checklist_item(uuid, text, int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_checklist_item(uuid, text, int)
  TO service_role;
