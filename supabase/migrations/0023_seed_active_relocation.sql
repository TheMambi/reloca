-- Reloca migration 0023 — seed the active "Long Beach move" + backfill relocation_id (Phase 8 · Wave B.3)
--
-- Seeds the single active relocation that drives the execution tiles, reproducing
-- the pre-cutover move context exactly: origin denver → destination long-beach,
-- move_date = the current NEXT_PUBLIC_MOVE_DATE (2026-09-30, a sample value).
-- Then backfills the Light-model relocation_id hook on the two Plane-2 tables.
--
-- Idempotent: re-running is a no-op (only seeds when the user has no relocation,
-- only backfills NULL rows). The single-user UUID is derived in-DB from an
-- existing table so the id never has to be typed into the migration file. It is
-- an identifier, not a secret (see docs/security-lockdown.md).

DO $$
DECLARE
  uid uuid;
  rid uuid;
BEGIN
  SELECT user_id INTO uid FROM checklist_items LIMIT 1;
  IF uid IS NULL THEN
    RAISE EXCEPTION 'no single-user UUID found in checklist_items; cannot seed relocation';
  END IF;

  -- Seed only if the user has no relocation yet.
  SELECT id INTO rid FROM relocations WHERE user_id = uid LIMIT 1;
  IF rid IS NULL THEN
    INSERT INTO relocations
      (user_id, label, origin_slug, destination_slug, move_date, is_active_move)
    VALUES
      (uid, 'Long Beach move', 'denver', 'long-beach', DATE '2026-09-30', true)
    RETURNING id INTO rid;
  END IF;

  -- Backfill the active relocation onto existing candidate buildings + saved
  -- neighborhoods (the thin Plane-2 slice the Light model scopes). NULL-only so
  -- a re-run never clobbers a future per-relocation assignment.
  UPDATE destinations
    SET relocation_id = rid
    WHERE user_id = uid AND relocation_id IS NULL;
  UPDATE saved_neighborhoods
    SET relocation_id = rid
    WHERE user_id = uid AND relocation_id IS NULL;
END $$;
