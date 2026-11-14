// Forward-geocode a postal address into { lat, lng } via the OSM Nominatim
// free public API. No key, no signup. Its usage policy allows one request per
// second and asks for an identifying User-Agent, so lookups are spaced a second
// apart and answers are kept.
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
import { USER_AGENT } from "../user-agent";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";
const MIN_GAP_MS = 1000;
// A lookup that would wait longer than this is skipped. The row is saved
// without coordinates and the next edit of its address tries again.
const MAX_WAIT_MS = 5000;
export const GEOCODE_CACHE_MAX = 500;
const MAX_ADDRESS_CHARS = 300;

type GeocodeResult = { lat: number; lng: number };

/** The parts a test replaces: the request, the clock and the wait. */
export type GeocodeDeps = {
  fetch: typeof fetch;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
};
const realDeps: GeocodeDeps = {
  fetch: (...args) => fetch(...args),
  now: Date.now,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

// The keys are text the caller typed, so the cache has a ceiling and drops its
// oldest entry first.
const cache = new Map<string, GeocodeResult | null>();
function remember(key: string, value: GeocodeResult | null): void {
  if (cache.size >= GEOCODE_CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, value);
}
export function geocodeCacheSize(): number {
  return cache.size;
}

// When the next request may leave. Each caller books the slot after the last.
let nextSlot = 0;

export async function geocodeAddress(
  address: string,
  deps: GeocodeDeps = realDeps,
): Promise<GeocodeResult | null> {
  const key = address.trim().toLowerCase();
  if (!key || key.length > MAX_ADDRESS_CHARS) return null;
  if (cache.has(key)) return cache.get(key) ?? null;

  const wait = Math.max(0, nextSlot - deps.now());
  if (wait > MAX_WAIT_MS) return null;
  nextSlot = deps.now() + wait + MIN_GAP_MS;
  if (wait > 0) await deps.sleep(wait);

  const url = `${NOMINATIM_BASE}?q=${encodeURIComponent(address)}&format=json&limit=1`;
  try {
    const res = await deps.fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { lat: string; lon: string }[];
    if (!Array.isArray(json) || json.length === 0) {
      remember(key, null);
      return null;
    }
    const lat = Number(json[0].lat);
    const lng = Number(json[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      remember(key, null);
      return null;
    }
    const result = { lat, lng };
    remember(key, result);
    return result;
  } catch (err) {
    // The name only. An error's text can carry the request, and the request
    // carries a home address.
    console.error("geocodeAddress failed:", err instanceof Error ? err.name : "unknown error");
    return null;
  }
}
