// Forward-geocode a postal address into { lat, lng } via the OSM Nominatim
// free public API. No key, no signup, 1 req/sec rate limit (single-user
// runtime — never approached).
//
// Wired into `recomputeDestinationOverlays` so a destination row picks up
// lat/lng on the same insert/update path that backfills HUD FMR.
//
// Best-effort: any failure (network, 4xx, parse) returns null and the caller
// continues without coordinates. The map tile (Task 7.34) renders the row
// without a pin; the rest of the row remains intact. An address Nominatim
// answers with no match is cached alongside successes, so repeated lookups for
// it don't each spend a request. A timeout or an error response is not cached,
// so the next lookup can succeed.

import "server-only";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";

type GeocodeResult = { lat: number; lng: number };

const cache = new Map<string, GeocodeResult | null>();

export async function geocodeAddress(
  address: string,
): Promise<GeocodeResult | null> {
  const key = address.trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;

  const url = `${NOMINATIM_BASE}?q=${encodeURIComponent(address)}&format=json&limit=1`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Reloca/1.0 (+https://github.com/TheMambi/reloca)",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { lat: string; lon: string }[];
    if (!Array.isArray(json) || json.length === 0) {
      cache.set(key, null);
      return null;
    }
    const lat = Number(json[0].lat);
    const lng = Number(json[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      cache.set(key, null);
      return null;
    }
    const result = { lat, lng };
    cache.set(key, result);
    return result;
  } catch (err) {
    console.error("geocodeAddress failed", { address, err });
    return null;
  }
}
