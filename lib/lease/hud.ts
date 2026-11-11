// HUD Fair Market Rent overlay loader.
//
// Server-only. Free API at https://www.huduser.gov/portal/dataset/fmr-api.html.
// We use it to fetch a per-zip FMR for each destination (typically 2BR) so the
// compare table can show a Δ vs HUD baseline. Every call is gated by:
//   - HUD_FMR_API_KEY presence (returns nulls if unset, so dev still works)
//   - ZIP → metro entity ID lookup (only zips we care about; expand as we add destinations)
//   - module-level cache by `${zip}-${beds}` (warm-start hits, no repeated API calls per request)
//
// Failure modes (network error, non-200, malformed JSON, missing row) all
// resolve to `{ value: null, year: null }` and get cached so we don't retry
// in a loop. The compare table renders a `—` and the "Δ vs HUD" cell hides.
//
// Server-only by convention — only imported from RSC loaders, server actions,
// and the overlays orchestrator. The HUD_FMR_API_KEY has no NEXT_PUBLIC_
// prefix so even an accidental client import would resolve to undefined.

export type FmrEntry = { value: number | null; year: number | null };

const HUD_FMR_API_KEY = process.env.HUD_FMR_API_KEY;
const HUD_BASE = "https://www.huduser.gov/hudapi/public/fmr/data";
const FETCH_TIMEOUT_MS = 10_000;

// Long Beach-Glendale-Long Beach HUD Metro FMR Area.
// Add entries here as the user saves more destinations.
const ZIP_TO_ENTITY: Record<string, string> = {
  "90802": "METRO31080MM4480", // Long Beach (Downtown / East Village)
  "90803": "METRO31080MM4480", // Long Beach (Belmont Shore)
  "90804": "METRO31080MM4480", // Long Beach (Eastside)
  "90810": "METRO31080MM4480", // Long Beach (Westside)
  "90813": "METRO31080MM4480", // Long Beach (Downtown / Drake Park)
};

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

export async function getFmr(zip: string, beds: number): Promise<FmrEntry> {
  const cacheKey = `${zip}-${beds}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  if (!HUD_FMR_API_KEY) return remember(cacheKey, EMPTY);

  const entity = ZIP_TO_ENTITY[zip];
  if (!entity) return remember(cacheKey, EMPTY);

  const bedKey = bedToKey(beds);
  if (!bedKey) return remember(cacheKey, EMPTY);

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
    return remember(cacheKey, EMPTY);
  }
  if (!res.ok) return remember(cacheKey, EMPTY);

  let json: HudResponse;
  try {
    json = (await res.json()) as HudResponse;
  } catch {
    return remember(cacheKey, EMPTY);
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
export const __internals = { ZIP_TO_ENTITY, bedToKey, coerceMoney, coerceYear };
