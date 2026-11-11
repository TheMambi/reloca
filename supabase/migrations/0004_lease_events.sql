-- Reloca migration 0004 — lease_events table + RLS for single-user mode (Phase 6)
--
-- Mirrors the LeaseEvent zod schema in schemas/lease.ts. Lease-scoped timeline
-- entries (notice deadlines, walkthroughs, key returns, deposit windows).
-- FK to lease_terms cascades on delete — deleting a lease nukes its events.
-- No updated_at column → no trigger.
-- Substitute <RELOCA_SINGLE_USER_ID> before running. Idempotent.

CREATE TABLE IF NOT EXISTS lease_events (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid          NOT NULL,
  lease_id      uuid          NOT NULL REFERENCES lease_terms(id) ON DELETE CASCADE,
  kind          text          NOT NULL CHECK (kind IN (
                  'notice_send_by',
                  'renewal_offer_expires',
                  'lease_end',
                  'target_move_out',
                  'notice_sent',
                  'walkthrough',
                  'key_return',
                  'deposit_claim_window_end'
                )),
  occurs_on     date          NOT NULL,
  status        text          NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','active','done','missed')),
  notes         text,
  created_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lease_events_lease_occurs
  ON lease_events (lease_id, occurs_on);

ALTER TABLE lease_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON lease_events TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "single_user_select" ON lease_events;
CREATE POLICY "single_user_select"
  ON lease_events FOR SELECT
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);

DROP POLICY IF EXISTS "single_user_insert" ON lease_events;
CREATE POLICY "single_user_insert"
  ON lease_events FOR INSERT
  WITH CHECK (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);

DROP POLICY IF EXISTS "single_user_update" ON lease_events;
CREATE POLICY "single_user_update"
  ON lease_events FOR UPDATE
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid)
  WITH CHECK (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);

DROP POLICY IF EXISTS "single_user_delete" ON lease_events;
CREATE POLICY "single_user_delete"
  ON lease_events FOR DELETE
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
