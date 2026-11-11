-- Reloca migration 0021 — relocation_id hook on destinations (Phase 8 · Wave B)
--
-- Light-model hook (AD-028): a candidate building optionally belongs to a
-- relocation. Nullable, no backfill here — existing rows stay NULL until the
-- seed + backfill step wires the active relocation. ON DELETE SET NULL so
-- removing a relocation never cascades into losing a saved building.
-- Requires 0020 (relocations) first. Idempotent.

ALTER TABLE destinations
  ADD COLUMN IF NOT EXISTS relocation_id uuid
  REFERENCES relocations (id) ON DELETE SET NULL;
