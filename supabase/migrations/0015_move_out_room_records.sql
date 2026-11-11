-- Reloca migration 0015 — move_out_room_records table + RLS for single-user mode (Phase 7)
--
-- Per-room rows for the deposit walkthrough (0014). walkthrough_id cascades on
-- delete; user_id is denormalized for clean RLS (matches the lease_events pattern
-- in 0004).
-- Mirrors the MoveOutRoomRecord zod schema in schemas/move-out.ts.
-- Substitute <RELOCA_SINGLE_USER_ID> before running. Idempotent.

CREATE TABLE IF NOT EXISTS move_out_room_records (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  walkthrough_id      uuid          NOT NULL REFERENCES move_out_walkthroughs(id) ON DELETE CASCADE,
  user_id             uuid          NOT NULL,
  room_name           text          NOT NULL,
  condition_rating    int           CHECK (condition_rating BETWEEN 1 AND 5),
  cleanliness_rating  int           CHECK (cleanliness_rating BETWEEN 1 AND 5),
  walls_status        text,
  floors_status       text,
  appliances_status   text,
  fixtures_status     text,
  notes               text,
  order_index         int           NOT NULL DEFAULT 0,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_move_out_room_records_walkthrough
  ON move_out_room_records (walkthrough_id, order_index);
CREATE INDEX IF NOT EXISTS idx_move_out_room_records_user
  ON move_out_room_records (user_id);

DROP TRIGGER IF EXISTS move_out_room_records_set_updated_at ON move_out_room_records;
CREATE TRIGGER move_out_room_records_set_updated_at
  BEFORE UPDATE ON move_out_room_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE move_out_room_records ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON move_out_room_records TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "single_user_select" ON move_out_room_records;
DROP POLICY IF EXISTS "single_user_insert" ON move_out_room_records;
DROP POLICY IF EXISTS "single_user_update" ON move_out_room_records;
DROP POLICY IF EXISTS "single_user_delete" ON move_out_room_records;

CREATE POLICY "single_user_select" ON move_out_room_records FOR SELECT
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
CREATE POLICY "single_user_insert" ON move_out_room_records FOR INSERT
  WITH CHECK (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
CREATE POLICY "single_user_update" ON move_out_room_records FOR UPDATE
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid)
  WITH CHECK (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
CREATE POLICY "single_user_delete" ON move_out_room_records FOR DELETE
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
