-- Reloca migration 0012 — address_change_targets table + RLS for single-user mode (Phase 7)
--
-- Tracks each entity that needs the new mailing address (USPS, banks, employer, DMV, etc).
-- Mirrors the AddressChangeTarget zod schema in schemas/logistics.ts.
-- Substitute <RELOCA_SINGLE_USER_ID> before running. Idempotent.

CREATE TABLE IF NOT EXISTS address_change_targets (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid          NOT NULL,
  kind              text          NOT NULL CHECK (kind IN
                                    ('usps','bank','employer','dmv','voter_reg',
                                     'auto_insurance','health_insurance','subscription','custom')),
  name              text          NOT NULL,
  due_date          date,
  channel           text          CHECK (channel IN ('online','phone','in_person','mail')),
  reference_number  text,
  status            text          NOT NULL DEFAULT 'needs_action'
                      CHECK (status IN ('needs_action','submitted','confirmed','skipped')),
  submitted_at      timestamptz,
  confirmed_at      timestamptz,
  notes             text,
  order_index       int           NOT NULL DEFAULT 0,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_address_change_targets_user_due
  ON address_change_targets (user_id, due_date);

DROP TRIGGER IF EXISTS address_change_targets_set_updated_at ON address_change_targets;
CREATE TRIGGER address_change_targets_set_updated_at
  BEFORE UPDATE ON address_change_targets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE address_change_targets ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON address_change_targets TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "single_user_select" ON address_change_targets;
DROP POLICY IF EXISTS "single_user_insert" ON address_change_targets;
DROP POLICY IF EXISTS "single_user_update" ON address_change_targets;
DROP POLICY IF EXISTS "single_user_delete" ON address_change_targets;

CREATE POLICY "single_user_select" ON address_change_targets FOR SELECT
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
CREATE POLICY "single_user_insert" ON address_change_targets FOR INSERT
  WITH CHECK (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
CREATE POLICY "single_user_update" ON address_change_targets FOR UPDATE
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid)
  WITH CHECK (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
CREATE POLICY "single_user_delete" ON address_change_targets FOR DELETE
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
