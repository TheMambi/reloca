-- Reloca migration 0003 — lease_terms table + RLS for single-user mode (Phase 6)
--
-- Mirrors the LeaseTerms zod schema in schemas/lease.ts.
-- Substitute <RELOCA_SINGLE_USER_ID> with the value from .env.local before running.
-- Re-running is safe: every statement is idempotent.

CREATE TABLE IF NOT EXISTS lease_terms (
  id                       uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid          NOT NULL,
  property_name            text          NOT NULL,
  unit_address             text          NOT NULL,
  city                     text          NOT NULL,
  landlord_email           text          NOT NULL,
  landlord_display_name    text,
  residents                jsonb         NOT NULL,
  lease_start_date         date          NOT NULL,
  lease_end_date           date          NOT NULL,
  notice_days_required     int           NOT NULL DEFAULT 60,
  target_move_out_date     date,
  renewal_offer_expires    date,
  current_monthly_rent     numeric(10,2) NOT NULL,
  renewal_monthly_rent     numeric(10,2),
  m2m_premium              numeric(10,2) NOT NULL DEFAULT 0,
  security_deposit         numeric(10,2),
  pet_rent_monthly         numeric(10,2) NOT NULL DEFAULT 0,
  parking_monthly          numeric(10,2) NOT NULL DEFAULT 0,
  included_utilities       text[]        NOT NULL DEFAULT '{}',
  late_fee_rules           text,
  decision                 text          NOT NULL DEFAULT 'undecided'
                             CHECK (decision IN ('undecided','renew','vacate','m2m')),
  created_at               timestamptz   NOT NULL DEFAULT now(),
  updated_at               timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lease_terms_user ON lease_terms (user_id);

DROP TRIGGER IF EXISTS lease_terms_set_updated_at ON lease_terms;
CREATE TRIGGER lease_terms_set_updated_at
  BEFORE UPDATE ON lease_terms
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE lease_terms ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON lease_terms TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "single_user_select" ON lease_terms;
CREATE POLICY "single_user_select"
  ON lease_terms FOR SELECT
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);

DROP POLICY IF EXISTS "single_user_insert" ON lease_terms;
CREATE POLICY "single_user_insert"
  ON lease_terms FOR INSERT
  WITH CHECK (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);

DROP POLICY IF EXISTS "single_user_update" ON lease_terms;
CREATE POLICY "single_user_update"
  ON lease_terms FOR UPDATE
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid)
  WITH CHECK (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);

DROP POLICY IF EXISTS "single_user_delete" ON lease_terms;
CREATE POLICY "single_user_delete"
  ON lease_terms FOR DELETE
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
