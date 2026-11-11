-- Reloca migration 0020 — relocations table + RLS for single-user mode (Phase 8 · Wave B)
--
-- Makes Relocation a first-class entity (Light model, AD-028). A relocation
-- scopes the reference comparison (origin↔destination) plus a thin slice of
-- user data via the relocation_id hooks added in 0021/0022. Exactly one row has
-- is_active_move = true (the active move that drives the execution tiles),
-- enforced by the partial unique index below.
-- Mirrors the RelocationSchema in schemas/relocation.ts.
-- Substitute <RELOCA_SINGLE_USER_ID> before running. Idempotent.

CREATE TABLE IF NOT EXISTS relocations (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid          NOT NULL,
  label             text          NOT NULL,
  origin_slug       text          NOT NULL,   -- FK-in-spirit to data/cities.json
  destination_slug  text          NOT NULL,   -- FK-in-spirit to data/cities.json
  move_date         date,
  is_active_move    boolean       NOT NULL DEFAULT false,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now()
);

-- Exactly one active move per user.
CREATE UNIQUE INDEX IF NOT EXISTS idx_relocations_one_active
  ON relocations (user_id) WHERE is_active_move;

-- Reuse the shared updated_at trigger function from migration 0001.
DROP TRIGGER IF EXISTS relocations_set_updated_at ON relocations;
CREATE TRIGGER relocations_set_updated_at
  BEFORE UPDATE ON relocations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE relocations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON relocations TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "single_user_select" ON relocations;
DROP POLICY IF EXISTS "single_user_insert" ON relocations;
DROP POLICY IF EXISTS "single_user_update" ON relocations;
DROP POLICY IF EXISTS "single_user_delete" ON relocations;

CREATE POLICY "single_user_select" ON relocations FOR SELECT
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
CREATE POLICY "single_user_insert" ON relocations FOR INSERT
  WITH CHECK (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
CREATE POLICY "single_user_update" ON relocations FOR UPDATE
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid)
  WITH CHECK (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
CREATE POLICY "single_user_delete" ON relocations FOR DELETE
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
