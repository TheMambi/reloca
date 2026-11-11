-- Reloca migration 0005 — notice_drafts table + RLS for single-user mode (Phase 6)
--
-- Mirrors the NoticeDraft zod schema in schemas/lease.ts. Lease-termination
-- notice letters: drafted, optionally sent (sent_at stamped once). FK to
-- lease_terms cascades — drafts have no meaning without their parent lease.
-- No updated_at column (drafts are insert-then-stamp-once, not edited).
-- Substitute <RELOCA_SINGLE_USER_ID> before running. Idempotent.

CREATE TABLE IF NOT EXISTS notice_drafts (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid          NOT NULL,
  lease_id        uuid          NOT NULL REFERENCES lease_terms(id) ON DELETE CASCADE,
  body_markdown   text          NOT NULL,
  body_plaintext  text          NOT NULL,
  subject_line    text          NOT NULL,
  recipient_email text          NOT NULL,
  move_out_date   date          NOT NULL,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  sent_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_notice_drafts_lease
  ON notice_drafts (lease_id, created_at DESC);

ALTER TABLE notice_drafts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON notice_drafts TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "single_user_select" ON notice_drafts;
CREATE POLICY "single_user_select"
  ON notice_drafts FOR SELECT
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);

DROP POLICY IF EXISTS "single_user_insert" ON notice_drafts;
CREATE POLICY "single_user_insert"
  ON notice_drafts FOR INSERT
  WITH CHECK (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);

DROP POLICY IF EXISTS "single_user_update" ON notice_drafts;
CREATE POLICY "single_user_update"
  ON notice_drafts FOR UPDATE
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid)
  WITH CHECK (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);

DROP POLICY IF EXISTS "single_user_delete" ON notice_drafts;
CREATE POLICY "single_user_delete"
  ON notice_drafts FOR DELETE
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
