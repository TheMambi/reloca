// Per-destination overlay orchestrator.
//
// On create / update of a destinations row, the server action calls
// `recomputeDestinationOverlays(id)` which resolves the HUD metro area from
// the row's city, fetches its 2BR HUD FMR, and writes `hud_fmr_2br` +
// `hud_fmr_year` back to the row.
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
import { getCities } from "@/lib/data/cities";

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
// A 5-digit run counts as a zip only right after a state code or as the last
// word of the text. A house number ("12345 Ventura Blvd") is neither.
const ZIP_AFTER_STATE = /\b[A-Z]{2},?\s+(\d{5})(?:-\d{4})?\b/g;
const ZIP_AT_END = /\s(\d{5})(?:-\d{4})?\s*$/;

export function extractZip(text: string | null | undefined): string | null {
  if (!text) return null;
  const afterState = [...text.matchAll(ZIP_AFTER_STATE)].map((m) => m[1]);
  if (afterState.length) return afterState[afterState.length - 1];
  return text.match(ZIP_AT_END)?.[1] ?? null;
}

/**
 * HUD metro entity id for a destination's city, from data/cities.json. The
 * state must agree when the row has one ("Long Beach, NY" is another metro).
 */
export function hudEntityForCity(
  city: string | null | undefined,
  stateCode: string | null | undefined,
): string | null {
  const name = (city ?? "").split(",")[0].trim().toLowerCase();
  if (!name) return null;
  const match = getCities().find(
    (c) =>
      c.displayName.toLowerCase() === name &&
      (!stateCode || c.stateCode === stateCode),
  );
  return match?.metro.hudEntityId ?? null;
}

/**
 * The overlay columns to write. A lookup that returned a value always wins.
 * A lookup that returned nothing clears the stored value only when the address
 * changed (the old value then describes another place); otherwise the row
 * keeps what it has, so a timeout or a skipped lookup never erases good data.
 */
export function overlayPatch(
  found: { fmr: { value: number | null; year: number | null }; geo: { lat: number; lng: number } | null },
  opts: { addressChanged: boolean; skipCoordinates: boolean },
): Partial<OverlayResult> {
  const patch: Partial<OverlayResult> = {};
  if (found.fmr.value !== null || opts.addressChanged) {
    patch.hud_fmr_2br = found.fmr.value;
    patch.hud_fmr_year = found.fmr.year;
  }
  if (!opts.skipCoordinates && (found.geo || opts.addressChanged)) {
    patch.lat = found.geo?.lat ?? null;
    patch.lng = found.geo?.lng ?? null;
  }
  return patch;
}

export async function recomputeDestinationOverlays(
  destinationId: string,
  opts: { addressChanged: boolean } = { addressChanged: true },
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
  const entity = hudEntityForCity(row.city, row.state_code);
  const fmr = entity ? await getFmr(entity, zip, 2) : { value: null, year: null };

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
  // unless the address changed (see overlayPatch).
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

  // Only write the overlay columns; never touch user-edited fields. The demo
  // skips geocoding, so it never writes coordinates either.
  const patch = overlayPatch(
    { fmr, geo },
    { addressChanged: opts.addressChanged, skipCoordinates: isDemoMode() },
  );
  if (Object.keys(patch).length === 0) return overlay;
  const { error: writeErr } = await sb
    .from("destinations")
    .update(patch)
    .eq("id", destinationId)
    .eq("user_id", userId);
  if (writeErr) {
    throw new Error(`recomputeDestinationOverlays.write: ${writeErr.message}`);
  }

  return overlay;
}
