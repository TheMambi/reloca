-- Reloca migration 0008 — extend checklist_items.category to allow 'lease' (Phase 6)
--
-- The lease module surfaces lease-specific tasks (notice letter, walkthrough
-- prep, deposit follow-up) in the existing checklist. Drop the v1 CHECK and
-- recreate with the additional 'lease' value. RLS / GRANT untouched — those
-- live on checklist_items from migrations 0001 and 0002.

ALTER TABLE checklist_items DROP CONSTRAINT checklist_items_category_check;

ALTER TABLE checklist_items ADD CONSTRAINT checklist_items_category_check
  CHECK (category IN ('pre-move-90d','pre-move-30d','move-week','post-move','lease'));
