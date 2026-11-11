-- Reloca migration 0024 — transient-safe checklist reorder RPC (Wave E.2 fix)
--
-- The 0018 RPC shifted neighbouring rows with `order_index = order_index ± 1`.
-- That trips the (user_id, category, order_index) UNIQUE INDEX
-- (idx_checklist_items_seedkey): the index is checked PER ROW within a
-- statement, not deferred to commit, so an in-place ±1 block shift transiently
-- duplicates a tuple (e.g. row 0→1 while a row still sits at 1) and Postgres
-- raises "duplicate key value violates unique constraint". Moving a row DOWN
-- happened to survive on row-processing order; moving a row UP (or the
-- cross-category make-room shift) failed → drag reorders never persisted.
--
-- The unique index can't be made DEFERRABLE (it's an index, not a constraint,
-- and the seeder's ON CONFLICT upsert depends on it as an arbiter, which
-- doesn't support deferred constraints). So instead we renumber every affected
-- row through a DISJOINT negative range first, then write the final dense
-- [0, N) positions. Each pass only ever writes values that are unoccupied at
-- write time, so no intermediate tuple collides regardless of row order.
--
-- The moved row is parked at -1; the renumbered others use -2, -3, … so the
-- two never overlap. Lease rows stay out of reorder (owned by
-- seedLeaseChecklistTasks).

CREATE OR REPLACE FUNCTION public.reorder_checklist_item(
  p_id uuid,
  p_target_category text,
  p_target_index int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_source_category text;
  v_source_index int;
  v_dest_others int;
  v_target int;
BEGIN
  IF p_target_category NOT IN ('pre-move', 'move-week', 'post-move', 'lease') THEN
    RAISE EXCEPTION 'Invalid target category: %', p_target_category;
  END IF;

  IF p_target_index < 0 THEN
    RAISE EXCEPTION 'Target index must be non-negative, got %', p_target_index;
  END IF;

  SELECT user_id, category, order_index
    INTO v_user_id, v_source_category, v_source_index
  FROM checklist_items
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checklist item % not found', p_id;
  END IF;

  -- No-op when the drop target equals the current position.
  IF v_source_category = p_target_category AND v_source_index = p_target_index THEN
    RETURN;
  END IF;

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

GRANT EXECUTE ON FUNCTION public.reorder_checklist_item(uuid, text, int)
  TO anon, authenticated, service_role;
