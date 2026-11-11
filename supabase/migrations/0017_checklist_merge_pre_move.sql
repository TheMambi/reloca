-- Reloca migration 0017 — merge pre-move-90d + pre-move-30d into pre-move
--
-- The two pre-move buckets felt redundant in practice: 90d / 30d planning
-- blurs in real timelines. Merge into a single 'pre-move' category and
-- renumber order_index per user so the (user_id, category, order_index)
-- uniqueness invariant survives the union.
--
-- Steps:
--   1. Drop the UNIQUE index — the mid-statement state during the
--      renumbering UPDATE would otherwise trip a collision.
--   2. Drop the CHECK so we can introduce the new 'pre-move' value.
--   3. UPDATE rows: set category = 'pre-move' and renumber order_index
--      via ROW_NUMBER() per user. 90d rows sort before 30d rows
--      (chronologically earlier work belongs at the top), then by the
--      existing order_index within each bucket, then by created_at
--      as a final tiebreaker.
--   4. Re-add the CHECK with the merged enum.
--   5. Re-add the UNIQUE index.

DROP INDEX IF EXISTS idx_checklist_items_seedkey;

ALTER TABLE checklist_items DROP CONSTRAINT checklist_items_category_check;

WITH renumbered AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id
           ORDER BY
             CASE category WHEN 'pre-move-90d' THEN 0 ELSE 1 END,
             order_index ASC,
             created_at ASC
         ) - 1 AS new_order
  FROM checklist_items
  WHERE category IN ('pre-move-90d', 'pre-move-30d')
)
UPDATE checklist_items
SET category = 'pre-move',
    order_index = renumbered.new_order
FROM renumbered
WHERE checklist_items.id = renumbered.id;

ALTER TABLE checklist_items ADD CONSTRAINT checklist_items_category_check
  CHECK (category IN ('pre-move','move-week','post-move','lease'));

CREATE UNIQUE INDEX idx_checklist_items_seedkey
  ON checklist_items (user_id, category, order_index);
