-- Phase 6 follow-up: prevent race-condition duplicate inserts on the
-- checklist_items seed path.
--
-- Background: seedChecklistIfEmpty reads then writes; under refresh-storm
-- traffic during the Wave A.1 crash, multiple concurrent calls all saw an
-- empty table and each ran the seed insert. Production accumulated 40+
-- rows from the 24-row seed.
--
-- Fix: UNIQUE(user_id, category, order_index) keys uniqueness to the
-- seed's natural key. The seed file has unique (category, order_index)
-- pairs. User-created items compute order_index = max(existing) + 1 per
-- category, so they don't collide with seed rows.
--
-- Combined with INSERT ... ON CONFLICT DO NOTHING in the seeder
-- (application-side change in app/checklist/actions.ts), a race is now
-- harmless instead of silently duplicating.

CREATE UNIQUE INDEX IF NOT EXISTS idx_checklist_items_seedkey
  ON checklist_items (user_id, category, order_index);
