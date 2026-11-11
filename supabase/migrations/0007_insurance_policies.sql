-- Reloca migration 0007 — insurance_policies table + RLS for single-user mode (Phase 6)
--
-- Mirrors the InsurancePolicy zod schema in schemas/lease.ts. Renters insurance
-- records scoped to either origin (Denver) or destination (Long Beach) properties.
-- Substitute <RELOCA_SINGLE_USER_ID> before running. Idempotent.

CREATE TABLE IF NOT EXISTS insurance_policies (
  id                       uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid          NOT NULL,
  scope                    text          NOT NULL CHECK (scope IN ('origin','destination')),
  property_label           text          NOT NULL,
  carrier                  text,
  policy_number            text,
  liability_amount         numeric(12,2) NOT NULL,
  personal_property_amount numeric(12,2) NOT NULL,
  monthly_cost             numeric(8,2),
  effective_from           date          NOT NULL,
  effective_to             date,
  interested_party_listed  boolean       NOT NULL DEFAULT false,
  interested_party_name    text,
  document_url             text,
  created_at               timestamptz   NOT NULL DEFAULT now(),
  updated_at               timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insurance_policies_user_scope
  ON insurance_policies (user_id, scope, effective_from);

DROP TRIGGER IF EXISTS insurance_policies_set_updated_at ON insurance_policies;
CREATE TRIGGER insurance_policies_set_updated_at
  BEFORE UPDATE ON insurance_policies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE insurance_policies ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON insurance_policies TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "single_user_select" ON insurance_policies;
CREATE POLICY "single_user_select"
  ON insurance_policies FOR SELECT
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);

DROP POLICY IF EXISTS "single_user_insert" ON insurance_policies;
CREATE POLICY "single_user_insert"
  ON insurance_policies FOR INSERT
  WITH CHECK (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);

DROP POLICY IF EXISTS "single_user_update" ON insurance_policies;
CREATE POLICY "single_user_update"
  ON insurance_policies FOR UPDATE
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid)
  WITH CHECK (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);

DROP POLICY IF EXISTS "single_user_delete" ON insurance_policies;
CREATE POLICY "single_user_delete"
  ON insurance_policies FOR DELETE
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
