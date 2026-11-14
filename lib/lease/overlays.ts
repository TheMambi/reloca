// Per-destination overlay orchestrator.
//
// On create / update of a destinations row, the server action calls
// `recomputeDestinationOverlays(id)` which derives the zip from the
// street_address, fetches the 2BR HUD FMR for that zip, and writes
// `hud_fmr_2br` + `hud_fmr_year` back to the row.
//
// Walk Score wiring is deferred per AD-018 (2026-05-05). The walkscore
// branch below is a guarded no-op: it stays inert until WALKSCORE_API_KEY
// shows up in the environment, at which point a future Task 6.22 module
// can drop in `getWalkScore()` and start populating walk/transit/bike
// without changing this orchestrator's contract.
//
// Server-only. The client carries the service-role key, so both queries here
// are scoped to the single user in code (see lib/supabase/server.ts).

import "server-only";
import { createAdminClient, isDemoMode, requireUserId } from "@/lib/supabase/server";
import { getFmr } from "@/lib/lease/hud";
import { geocodeAddress } from "@/lib/lease/geocode";

export type OverlayResult = {
  hud_fmr_2br: number | null;
  hud_fmr_year: number | null;
  walk_score: number | null;
  transit_score: number | null;
  bike_score: number | null;
  lat: number | null;
  lng: number | null;
};

const EMPTY_OVERLAY: OverlayResult = {
  hud_fmr_2br: null,
  hud_fmr_year: null,
  walk_score: null,
  transit_score: null,
  bike_score: null,
  lat: null,
  lng: null,
};

// US ZIP-5 with optional ZIP+4. We only keep the 5-digit base for HUD lookup.
// Scans the combined address text and returns the LAST 5-digit run, since zips
// conventionally come at the end and a unit/suite number ("Suite 12345") could
// otherwise win against a real zip later in the same string.
const ZIP_RE_GLOBAL = /\b(\d{5})(?:-\d{4})?\b/g;

export function extractZip(text: string | null | undefined): string | null {
  if (!text) return null;
  const matches = [...text.matchAll(ZIP_RE_GLOBAL)].map((m) => m[1]);
  return matches.length ? matches[matches.length - 1] : null;
}

export async function recomputeDestinationOverlays(
  destinationId: string,
): Promise<OverlayResult> {
  const sb = createAdminClient();
  const userId = requireUserId();

  const { data: row, error: readErr } = await sb
    .from("destinations")
    .select("id, street_address, city, state_code, zip_code")
    .eq("id", destinationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (readErr) {
    throw new Error(`recomputeDestinationOverlays.read: ${readErr.message}`);
  }
  if (!row) {
    // Row vanished between insert and overlay (delete race) — nothing to do.
    return EMPTY_OVERLAY;
  }

  // Prefer the structured zip_code column when present (post-migration 0010);
  // fall back to scanning the address text for legacy rows that still have
  // the zip embedded in city or street_address.
  const structuredZip =
    typeof row.zip_code === "string" && /^\d{5}/.test(row.zip_code)
      ? row.zip_code.slice(0, 5)
      : null;
  const zip =
    structuredZip ??
    extractZip(`${row.street_address ?? ""} ${row.city ?? ""}`);
  const fmr = zip ? await getFmr(zip, 2) : { value: null, year: null };

  // AD-018: Walk Score branch deferred. When WALKSCORE_API_KEY arrives and
  // `lib/lease/walkscore.ts` ships, replace the three nulls with:
  //   const ws = await getWalkScore(`${row.street_address}, ${row.city}`, null, null);
  //   walk_score: ws.walk, transit_score: ws.transit, bike_score: ws.bike
  const walk: { walk: number | null; transit: number | null; bike: number | null } = {
    walk: null,
    transit: null,
    bike: null,
  };

  // Geocode the row's full postal address (Task 7.32). Best-effort — a
  // Nominatim outage returns null and the row keeps its existing lat/lng
  // (the write below preserves nulls only on first run; re-runs after an
  // address edit deliberately re-fetch).
  const fullAddress = [
    row.street_address,
    row.city,
    row.state_code,
    row.zip_code,
  ]
    .filter(Boolean)
    .join(", ");
  // The public demo skips geocoding so anonymous traffic never hits Nominatim.
  const geo = fullAddress && !isDemoMode() ? await geocodeAddress(fullAddress) : null;

  const overlay: OverlayResult = {
    hud_fmr_2br: fmr.value,
    hud_fmr_year: fmr.year,
    walk_score: walk.walk,
    transit_score: walk.transit,
    bike_score: walk.bike,
    lat: geo?.lat ?? null,
    lng: geo?.lng ?? null,
  };

  // Only write the overlay columns; never touch user-edited fields. We always
  // write all values (including nulls) so a re-run after an address edit clears
  // stale values from a previous zip / location.
  const { error: writeErr } = await sb
    .from("destinations")
    .update({
      hud_fmr_2br: overlay.hud_fmr_2br,
      hud_fmr_year: overlay.hud_fmr_year,
      walk_score: overlay.walk_score,
      transit_score: overlay.transit_score,
      bike_score: overlay.bike_score,
      lat: overlay.lat,
      lng: overlay.lng,
    })
    .eq("id", destinationId)
    .eq("user_id", userId);
  if (writeErr) {
    throw new Error(`recomputeDestinationOverlays.write: ${writeErr.message}`);
  }

  return overlay;
}
