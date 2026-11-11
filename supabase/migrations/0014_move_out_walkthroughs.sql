-- Reloca migration 0014 — move_out_walkthroughs table + RLS for single-user mode (Phase 7)
--
-- Header for the deposit-protection walkthrough. Optional FK to lease_terms (set null
-- on delete so the historical record survives lease deletion). Per-room rows live in
-- move_out_room_records (0015).
-- Mirrors the MoveOutWalkthrough zod schema in schemas/move-out.ts.
-- Substitute <RELOCA_SINGLE_USER_ID> before running. Idempotent.

CREATE TABLE IF NOT EXISTS move_out_walkthroughs (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid          NOT NULL,
  lease_terms_id    uuid          REFERENCES lease_terms(id) ON DELETE SET NULL,
  walkthrough_date  date,
  overall_notes     text,
  pdf_generated_at  timestamptz,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_move_out_walkthroughs_user
  ON move_out_walkthroughs (user_id);

DROP TRIGGER IF EXISTS move_out_walkthroughs_set_updated_at ON move_out_walkthroughs;
CREATE TRIGGER move_out_walkthroughs_set_updated_at
  BEFORE UPDATE ON move_out_walkthroughs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE move_out_walkthroughs ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON move_out_walkthroughs TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "single_user_select" ON move_out_walkthroughs;
DROP POLICY IF EXISTS "single_user_insert" ON move_out_walkthroughs;
DROP POLICY IF EXISTS "single_user_update" ON move_out_walkthroughs;
DROP POLICY IF EXISTS "single_user_delete" ON move_out_walkthroughs;

CREATE POLICY "single_user_select" ON move_out_walkthroughs FOR SELECT
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
CREATE POLICY "single_user_insert" ON move_out_walkthroughs FOR INSERT
  WITH CHECK (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
CREATE POLICY "single_user_update" ON move_out_walkthroughs FOR UPDATE
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid)
  WITH CHECK (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
CREATE POLICY "single_user_delete" ON move_out_walkthroughs FOR DELETE
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
