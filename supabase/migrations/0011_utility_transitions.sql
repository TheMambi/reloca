-- Reloca migration 0011 — utility_transitions table + RLS for single-user mode (Phase 7)
--
-- Tracks per-utility shutoff (origin) / setup (destination) status across the move.
-- Mirrors the UtilityTransition zod schema in schemas/logistics.ts.
-- Substitute <RELOCA_SINGLE_USER_ID> before running. Idempotent.

CREATE TABLE IF NOT EXISTS utility_transitions (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid          NOT NULL,
  kind            text          NOT NULL CHECK (kind IN
                                  ('electricity','gas','water','trash','internet','tv','custom')),
  side            text          NOT NULL CHECK (side IN ('origin','destination')),
  custom_label    text,
  provider        text,
  account_number  text,
  login_url       text,
  phone           text,
  notes           text,
  scheduled_date  date,
  status          text          NOT NULL DEFAULT 'needs_action'
                    CHECK (status IN ('needs_action','scheduled','in_progress','confirmed','skipped')),
  confirmed_at    timestamptz,
  order_index     int           NOT NULL DEFAULT 0,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_utility_transitions_status ON utility_transitions (user_id, status);

DROP TRIGGER IF EXISTS utility_transitions_set_updated_at ON utility_transitions;
CREATE TRIGGER utility_transitions_set_updated_at
  BEFORE UPDATE ON utility_transitions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE utility_transitions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON utility_transitions TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "single_user_select" ON utility_transitions;
DROP POLICY IF EXISTS "single_user_insert" ON utility_transitions;
DROP POLICY IF EXISTS "single_user_update" ON utility_transitions;
DROP POLICY IF EXISTS "single_user_delete" ON utility_transitions;

CREATE POLICY "single_user_select" ON utility_transitions FOR SELECT
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
CREATE POLICY "single_user_insert" ON utility_transitions FOR INSERT
  WITH CHECK (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
CREATE POLICY "single_user_update" ON utility_transitions FOR UPDATE
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid)
  WITH CHECK (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
CREATE POLICY "single_user_delete" ON utility_transitions FOR DELETE
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
