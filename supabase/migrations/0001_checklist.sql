-- Reloca migration 0001 — checklist_items table + RLS for single-user mode (v1)
--
-- The committed file uses a placeholder for the user UUID so the real id stays out of git.
-- The id is an identifier, not a secret: these policies never checked who was calling.
-- Migration 0025 drops them and closes the tables to anon and authenticated.
-- Before running, substitute <RELOCA_SINGLE_USER_ID> with the value from .env.local.
-- Re-running is safe: every statement is idempotent (CREATE OR REPLACE / IF NOT EXISTS-friendly trigger pattern).

CREATE TABLE IF NOT EXISTS checklist_items (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid          NOT NULL,
  category     text          NOT NULL CHECK (category IN ('pre-move-90d','pre-move-30d','move-week','post-move')),
  title        text          NOT NULL,
  description  text,
  due_date     date,
  completed    boolean       NOT NULL DEFAULT false,
  completed_at timestamptz,
  order_index  integer       NOT NULL DEFAULT 0,
  created_at   timestamptz   NOT NULL DEFAULT now(),
  updated_at   timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checklist_user_category
  ON checklist_items (user_id, category, order_index);

-- updated_at auto-touch
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS checklist_items_set_updated_at ON checklist_items;
CREATE TRIGGER checklist_items_set_updated_at
  BEFORE UPDATE ON checklist_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- completed_at sync — fills/clears alongside the boolean
CREATE OR REPLACE FUNCTION sync_completed_at() RETURNS trigger AS $$
BEGIN
  IF NEW.completed = true AND (OLD.completed = false OR OLD.completed IS NULL) THEN
    NEW.completed_at = now();
  ELSIF NEW.completed = false THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS checklist_items_sync_completed_at ON checklist_items;
CREATE TRIGGER checklist_items_sync_completed_at
  BEFORE UPDATE ON checklist_items
  FOR EACH ROW EXECUTE FUNCTION sync_completed_at();

-- Row-Level Security (defensive — the "Automatic RLS" project setting also enables it)
ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;

-- API role grants (required because "Automatically expose new tables" is disabled at project level)
GRANT SELECT, INSERT, UPDATE, DELETE ON checklist_items TO anon, authenticated;

-- Single-user RLS policies. v1 has no auth — gate by the env-injected UUID.
DROP POLICY IF EXISTS "single_user_select" ON checklist_items;
CREATE POLICY "single_user_select"
  ON checklist_items FOR SELECT
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);

DROP POLICY IF EXISTS "single_user_insert" ON checklist_items;
CREATE POLICY "single_user_insert"
  ON checklist_items FOR INSERT
  WITH CHECK (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);

DROP POLICY IF EXISTS "single_user_update" ON checklist_items;
CREATE POLICY "single_user_update"
  ON checklist_items FOR UPDATE
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid)
  WITH CHECK (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);

DROP POLICY IF EXISTS "single_user_delete" ON checklist_items;
CREATE POLICY "single_user_delete"
  ON checklist_items FOR DELETE
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
