-- Reloca migration 0013 — move_estimates table + RLS for single-user mode (Phase 7)
--
-- One row per user: holds the trip's distance/volume baseline plus a JSON array
-- of cost scenarios (DIY, container, full-service, hybrid). UNIQUE(user_id)
-- enforces the singleton — upserts target this constraint.
-- Mirrors the MoveEstimate zod schema in schemas/move-cost.ts.
-- Substitute <RELOCA_SINGLE_USER_ID> before running. Idempotent.

CREATE TABLE IF NOT EXISTS move_estimates (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid          NOT NULL UNIQUE,
  distance_miles      numeric,
  volume_cuft         numeric,
  move_date           date,
  scenarios           jsonb         NOT NULL DEFAULT '[]'::jsonb,
  chosen_scenario_id  text,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS move_estimates_set_updated_at ON move_estimates;
CREATE TRIGGER move_estimates_set_updated_at
  BEFORE UPDATE ON move_estimates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE move_estimates ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON move_estimates TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "single_user_select" ON move_estimates;
DROP POLICY IF EXISTS "single_user_insert" ON move_estimates;
DROP POLICY IF EXISTS "single_user_update" ON move_estimates;
DROP POLICY IF EXISTS "single_user_delete" ON move_estimates;

CREATE POLICY "single_user_select" ON move_estimates FOR SELECT
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
CREATE POLICY "single_user_insert" ON move_estimates FOR INSERT
  WITH CHECK (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
CREATE POLICY "single_user_update" ON move_estimates FOR UPDATE
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid)
  WITH CHECK (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
CREATE POLICY "single_user_delete" ON move_estimates FOR DELETE
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
