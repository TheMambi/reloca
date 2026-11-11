-- Reloca migration 0019 — saved_neighborhoods table + RLS for single-user mode (Phase 7 follow-up · Wave D)
--
-- Lets the user heart-save a neighborhood from the /properties Neighborhoods tab so
-- they can come back to it and (D.7) compare saved neighborhoods side-by-side.
-- Mirrors the SavedNeighborhood Zod schema in schemas/saved-neighborhood.ts.
-- Substitute <RELOCA_SINGLE_USER_ID> before running. Idempotent.

CREATE TABLE IF NOT EXISTS saved_neighborhoods (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid          NOT NULL,
  neighborhood  text          NOT NULL,
  city          text          NOT NULL,
  notes         text,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  -- Same neighborhood+city pair can only be saved once per user. The UNIQUE
  -- index also serves the (user_id) read path; no extra index needed.
  UNIQUE (user_id, neighborhood, city)
);

ALTER TABLE saved_neighborhoods ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON saved_neighborhoods TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "single_user_select" ON saved_neighborhoods;
DROP POLICY IF EXISTS "single_user_insert" ON saved_neighborhoods;
DROP POLICY IF EXISTS "single_user_update" ON saved_neighborhoods;
DROP POLICY IF EXISTS "single_user_delete" ON saved_neighborhoods;

CREATE POLICY "single_user_select" ON saved_neighborhoods FOR SELECT
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
CREATE POLICY "single_user_insert" ON saved_neighborhoods FOR INSERT
  WITH CHECK (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
CREATE POLICY "single_user_update" ON saved_neighborhoods FOR UPDATE
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid)
  WITH CHECK (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
CREATE POLICY "single_user_delete" ON saved_neighborhoods FOR DELETE
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
