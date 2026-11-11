-- Reloca migration 0010 — destinations: split address into city / state_code / zip_code
--
-- Rationale (Wave B Task 6.27 redesign): forcing users to type "Long Beach, CA 90802"
-- into the city field conflated three concepts and made the HUD FMR zip extraction
-- brittle. Splitting into three columns lets the dialog render a clean state dropdown
-- + zip input, and lets overlays.ts read zip_code directly instead of regex-scanning.
--
-- Both new columns are nullable so existing rows stay valid; the dialog edit mode lets
-- users fix old rows interactively. No backfill — single user, single existing row.
--
-- Idempotent.

ALTER TABLE destinations
  ADD COLUMN IF NOT EXISTS state_code text,
  ADD COLUMN IF NOT EXISTS zip_code   text;

-- 2-letter US state codes (postal). NULL stays allowed.
ALTER TABLE destinations
  DROP CONSTRAINT IF EXISTS destinations_state_code_chk;
ALTER TABLE destinations
  ADD CONSTRAINT destinations_state_code_chk
  CHECK (state_code IS NULL OR state_code ~ '^[A-Z]{2}$');

-- US ZIP-5 or ZIP+4. NULL stays allowed.
ALTER TABLE destinations
  DROP CONSTRAINT IF EXISTS destinations_zip_code_chk;
ALTER TABLE destinations
  ADD CONSTRAINT destinations_zip_code_chk
  CHECK (zip_code IS NULL OR zip_code ~ '^\d{5}(-\d{4})?$');
