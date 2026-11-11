-- Reloca migration 0006 — destinations table + RLS for single-user mode (Phase 6)
--
-- Mirrors the Destination zod schema in schemas/lease.ts. Candidate Long Beach
-- properties under evaluation. Partial unique index enforces "at most one
-- active target" without forbidding the all-inactive state.
-- Substitute <RELOCA_SINGLE_USER_ID> before running. Idempotent.

CREATE TABLE IF NOT EXISTS destinations (
  id                       uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid          NOT NULL,
  building_name            text          NOT NULL,
  street_address           text          NOT NULL,
  city                     text          NOT NULL,
  source_url               text,
  fetch_status             text          NOT NULL DEFAULT 'manual'
                             CHECK (fetch_status IN ('manual','needs_review','verified','fetch_failed')),
  fetched_at               timestamptz,
  monthly_rent_low         numeric(10,2),
  monthly_rent_high        numeric(10,2),
  application_fee          numeric(10,2),
  security_deposit         numeric(10,2),
  pet_rent_monthly         numeric(10,2),
  parking_monthly          numeric(10,2),
  beds                     numeric(3,1),
  baths                    numeric(3,1),
  sqft                     int,
  amenities                text[]        NOT NULL DEFAULT '{}',
  pets_allowed             boolean,
  furnished                boolean,
  hud_fmr_2br              numeric(10,2),
  hud_fmr_year             int,
  walk_score               int,
  transit_score            int,
  bike_score               int,
  insurance_required       boolean       NOT NULL DEFAULT true,
  insurance_min_liability  numeric(12,2),
  insurance_min_property   numeric(12,2),
  is_active_target         boolean       NOT NULL DEFAULT false,
  notes                    text,
  created_at               timestamptz   NOT NULL DEFAULT now(),
  updated_at               timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_destinations_user
  ON destinations (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_destinations_one_active
  ON destinations (user_id) WHERE is_active_target = true;

DROP TRIGGER IF EXISTS destinations_set_updated_at ON destinations;
CREATE TRIGGER destinations_set_updated_at
  BEFORE UPDATE ON destinations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE destinations ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON destinations TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "single_user_select" ON destinations;
CREATE POLICY "single_user_select"
  ON destinations FOR SELECT
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);

DROP POLICY IF EXISTS "single_user_insert" ON destinations;
CREATE POLICY "single_user_insert"
  ON destinations FOR INSERT
  WITH CHECK (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);

DROP POLICY IF EXISTS "single_user_update" ON destinations;
CREATE POLICY "single_user_update"
  ON destinations FOR UPDATE
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid)
  WITH CHECK (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);

DROP POLICY IF EXISTS "single_user_delete" ON destinations;
CREATE POLICY "single_user_delete"
  ON destinations FOR DELETE
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
