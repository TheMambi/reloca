// HUD Fair Market Rent overlay loader.
//
// Server-only. Free API at https://www.huduser.gov/portal/dataset/fmr-api.html.
// We use it to fetch the FMR for each destination (typically 2BR) so the
// compare table can show a Δ vs HUD baseline. Every call is gated by:
//   - HUD_FMR_API_KEY presence (returns nulls if unset, so dev still works)
//   - a HUD metro entity id, which the caller resolves from the destination's
//     city through data/cities.json
//   - module-level cache by entity, zip and beds (warm-start hits, no repeated API calls per request)
//
// Failure modes (network error, non-200, malformed JSON, missing row) all
// resolve to `{ value: null, year: null }`. Only an answer from HUD is cached.
// A timeout or an error response is not, so the next lookup can succeed.
// The compare table renders a `—` and the "Δ vs HUD" cell hides.
//
// Server-only: imported from RSC loaders, server actions and the overlays
// orchestrator. The import below turns a client import into a build error.

import "server-only";

export type FmrEntry = { value: number | null; year: number | null };

const HUD_FMR_API_KEY = process.env.HUD_FMR_API_KEY;
const HUD_BASE = "https://www.huduser.gov/hudapi/public/fmr/data";
const FETCH_TIMEOUT_MS = 10_000;

const BED_KEYS = [
  "Efficiency",
  "One-Bedroom",
  "Two-Bedroom",
  "Three-Bedroom",
  "Four-Bedroom",
] as const;
type BedKey = (typeof BED_KEYS)[number];

type HudBasicRow = Partial<Record<BedKey, number | string>> & {
  zip_code?: string;
  year?: number | string;
};

type HudResponse = {
  data?: {
    year?: number | string;
    basicdata?: HudBasicRow | HudBasicRow[];
  };
};

const cache = new Map<string, FmrEntry>();
const EMPTY: FmrEntry = { value: null, year: null };

function bedToKey(beds: number): BedKey | null {
  if (!Number.isInteger(beds) || beds < 0 || beds > 4) return null;
  return BED_KEYS[beds];
}

function coerceYear(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v)) return v;
  if (typeof v === "string" && /^\d{4}$/.test(v)) return Number(v);
  return null;
}

function coerceMoney(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/[$,\s]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function remember(key: string, entry: FmrEntry): FmrEntry {
  cache.set(key, entry);
  return entry;
}

export async function getFmr(
  entity: string,
  zip: string | null,
  beds: number,
): Promise<FmrEntry> {
  const cacheKey = `${entity}-${zip ?? ""}-${beds}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  if (!HUD_FMR_API_KEY) return EMPTY;

  const bedKey = bedToKey(beds);
  if (!bedKey) return EMPTY;

  let res: Response;
  try {
    res = await fetch(`${HUD_BASE}/${entity}`, {
      headers: {
        Authorization: `Bearer ${HUD_FMR_API_KEY}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    return EMPTY;
  }
  if (!res.ok) return EMPTY;

  let json: HudResponse;
  try {
    json = (await res.json()) as HudResponse;
  } catch {
    return EMPTY;
  }

  const raw = json.data?.basicdata;
  const rows: HudBasicRow[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  if (rows.length === 0) return remember(cacheKey, EMPTY);

  // SAFMR responses include one row per zip; non-SAFMR returns a single
  // metro-wide row. Match by zip when present, fall back to first row.
  const row = rows.find((r) => r.zip_code === zip) ?? rows[0];

  const value = coerceMoney(row[bedKey]);
  const year = coerceYear(row.year) ?? coerceYear(json.data?.year);

  return remember(cacheKey, { value, year });
}

// Exported for tests only — do not use from app code.
export const __internals = { bedToKey, coerceMoney, coerceYear };
