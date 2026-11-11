-- Reloca migration 0016 — geocoded coordinates on destinations + lease_terms (Phase 7)
--
-- Additive only: adds nullable lat/lng columns so the route-map view can plot the
-- origin and active destination without re-geocoding on every render. Backfill
-- happens lazily from the geocoding adapter (see lib/geocode.ts).
--
-- No RLS / GRANT / policy changes — additive columns inherit the existing
-- per-table grants and policies installed in 0006 (destinations) and 0003 (lease_terms).
-- Idempotent.

ALTER TABLE destinations ADD COLUMN IF NOT EXISTS lat numeric;
ALTER TABLE destinations ADD COLUMN IF NOT EXISTS lng numeric;

ALTER TABLE lease_terms ADD COLUMN IF NOT EXISTS origin_lat numeric;
ALTER TABLE lease_terms ADD COLUMN IF NOT EXISTS origin_lng numeric;
