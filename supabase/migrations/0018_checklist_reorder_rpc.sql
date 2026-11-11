-- Reloca migration 0018 — atomic checklist reorder RPC
--
-- The (user_id, category, order_index) UNIQUE index on checklist_items is
-- great for preventing seed-race duplicates, but it makes interactive
-- drag-and-drop reordering tricky from the JS client side: a naïve
-- "shift these rows" sequence trips the index mid-statement.
--
-- This RPC moves a single row to a new (category, index) target and
-- shifts the affected rows in one transaction. Postgres checks UNIQUE
-- violations at the END of each statement, not row-by-row, so each of the
-- inner UPDATEs is safe as long as its FINAL state has no duplicates.
-- The "park at -1" step keeps the moved row out of the way during the
-- shift; the negative value can never collide with the [0, N-1] dense
-- positives used everywhere else.
--
-- Lease rows are excluded from reorder — they're owned by
-- seedLeaseChecklistTasks and reordering them here would drift from that
-- source of truth.

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

  -- Park the moved row out of the way so the shift updates below can't
  -- collide with it on the UNIQUE index.
  UPDATE checklist_items SET order_index = -1 WHERE id = p_id;

  IF v_source_category = p_target_category THEN
    -- Same-category reorder.
    IF v_source_index < p_target_index THEN
      -- Moving down: rows in (source+1 .. target) shift up by one.
      UPDATE checklist_items
      SET order_index = order_index - 1
      WHERE user_id = v_user_id
        AND category = v_source_category
        AND order_index BETWEEN v_source_index + 1 AND p_target_index
        AND id <> p_id;
    ELSE
      -- Moving up: rows in (target .. source-1) shift down by one.
      UPDATE checklist_items
      SET order_index = order_index + 1
      WHERE user_id = v_user_id
        AND category = v_source_category
        AND order_index BETWEEN p_target_index AND v_source_index - 1
        AND id <> p_id;
    END IF;
  ELSE
    -- Cross-category move.
    -- Close the gap left in the source category.
    UPDATE checklist_items
    SET order_index = order_index - 1
    WHERE user_id = v_user_id
      AND category = v_source_category
      AND order_index > v_source_index;

    -- Make room at the target index in the destination category.
    UPDATE checklist_items
    SET order_index = order_index + 1
    WHERE user_id = v_user_id
      AND category = p_target_category
      AND order_index >= p_target_index;
  END IF;

  -- Place the moved row at its final position.
  UPDATE checklist_items
  SET category = p_target_category,
      order_index = p_target_index,
      updated_at = now()
  WHERE id = p_id;
END;
$$;

-- Match the existing GRANT pattern: PostgREST exposes RPCs only when the
-- caller's role has EXECUTE.
GRANT EXECUTE ON FUNCTION public.reorder_checklist_item(uuid, text, int)
  TO anon, authenticated, service_role;
