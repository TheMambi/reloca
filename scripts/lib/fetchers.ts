// Per-domain live fetchers for the Phase 8 ingestion pipeline (AD-030).
//
// Each source is split into a PURE `parse*(json)` (fixture-testable, no network)
// and a thin `fetch*()` that calls the API through the shared best-effort
// `getJson` helper. Every fetcher is best-effort: a missing key, network error,
// non-200, or malformed body resolves to `null` so the orchestrator can fall
// back to the hand-authored / modeled value and tag the tier honestly.
//
// SECURITY: API keys/tokens are read from process.env at call time and never
// logged. `getJson` logs only the caller-supplied source label on failure —
// never the URL (AirNow/Census carry the key in the query string).
//
// Run context: standalone tsx script (`scripts/ingest-city.ts`), not the Next
// app. Server-side only; no NEXT_PUBLIC_ prefixes involved.

const DEFAULT_TIMEOUT_MS = 15_000;

export type FetchImpl = typeof fetch;

type GetJsonOpts = {
  label: string;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  body?: string;
  timeoutMs?: number;
  fetchImpl?: FetchImpl;
};

/**
 * Best-effort JSON GET/POST. Returns the parsed body, or null on any failure
 * (timeout, network error, non-2xx, non-JSON). Never throws, never logs URLs
 * or secrets — only the source `label`.
 */
export async function getJson(
  url: string,
  opts: GetJsonOpts,
): Promise<unknown | null> {
  const { label, headers, method = "GET", body, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;
  const fetchImpl = opts.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(url, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      console.warn(`  [${label}] HTTP ${res.status} — falling back`);
      return null;
    }
    return await res.json();
  } catch {
    console.warn(`  [${label}] request failed — falling back`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Shared coercion helpers
// ─────────────────────────────────────────────────────────────────────────

function coerceNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/[$,\s]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// ACS jams missing/insufficient values with large negative sentinels
// (-666666666, -999999999, …). Treat any such value as null.
function coerceCensus(v: unknown): number | null {
  const n = coerceNumber(v);
  if (n === null) return null;
  if (n <= -666666666) return null;
  return n;
}

// ─────────────────────────────────────────────────────────────────────────
// 1. NOAA Climate Data Online — annual climate normals (1991–2020)
// ─────────────────────────────────────────────────────────────────────────

export type NoaaNormals = {
  avgHighF: number;
  avgLowF: number;
  annualPrecipitationIn: number;
  heatDaysPerYear: number;
};

type NoaaResponse = { results?: { datatype: string; value: number | string }[] };

export function parseNoaaNormals(json: unknown): NoaaNormals | null {
  const results = (json as NoaaResponse)?.results;
  if (!Array.isArray(results) || results.length === 0) return null;
  const pick = (dt: string): number | null => {
    const row = results.find((r) => r.datatype === dt);
    return row ? coerceNumber(row.value) : null;
  };
  const high = pick("ANN-TMAX-NORMAL");
  const low = pick("ANN-TMIN-NORMAL");
  const precip = pick("ANN-PRCP-NORMAL");
  const heat = pick("ANN-TMAX-AVGNDS-GRTH090");
  if (high === null || low === null || precip === null || heat === null) return null;
  return {
    avgHighF: Math.round(high),
    avgLowF: Math.round(low),
    annualPrecipitationIn: Math.round(precip * 10) / 10,
    heatDaysPerYear: Math.round(heat),
  };
}

export async function fetchNoaaNormals(
  stationId: string,
  fetchImpl?: FetchImpl,
): Promise<NoaaNormals | null> {
  const token = process.env.NOAA_CDO_TOKEN;
  if (!token) {
    console.warn("  [noaa] NOAA_CDO_TOKEN absent — falling back");
    return null;
  }
  const params = new URLSearchParams({
    datasetid: "NORMAL_ANN",
    stationid: stationId,
    units: "standard",
    startdate: "2010-01-01",
    enddate: "2010-12-31",
    limit: "50",
  });
  for (const dt of [
    "ANN-TMAX-NORMAL",
    "ANN-TMIN-NORMAL",
    "ANN-PRCP-NORMAL",
    "ANN-TMAX-AVGNDS-GRTH090",
  ]) {
    params.append("datatypeid", dt);
  }
  const json = await getJson(
    `https://www.ncei.noaa.gov/cdo-web/api/v2/data?${params.toString()}`,
    { label: "noaa", headers: { token }, fetchImpl },
  );
  return json ? parseNoaaNormals(json) : null;
}

// ─────────────────────────────────────────────────────────────────────────
// 2. HUD Fair Market Rent — per metro entity, all bed sizes
// ─────────────────────────────────────────────────────────────────────────

export type FmrRents = {
  efficiency: number | null;
  oneBr: number | null;
  twoBr: number | null;
  threeBr: number | null;
  fourBr: number | null;
  year: number | null;
  areaName: string | null;
};

type HudBasic = Record<string, number | string | undefined>;
type HudResponse = {
  data?: { year?: number | string; area_name?: string; basicdata?: HudBasic | HudBasic[] };
};

export function parseFmr(json: unknown): FmrRents | null {
  const data = (json as HudResponse)?.data;
  if (!data) return null;
  const raw = data.basicdata;
  const row: HudBasic | undefined = Array.isArray(raw) ? raw[0] : raw;
  if (!row) return null;
  const year = coerceNumber(data.year);
  const rents: FmrRents = {
    efficiency: coerceNumber(row["Efficiency"]),
    oneBr: coerceNumber(row["One-Bedroom"]),
    twoBr: coerceNumber(row["Two-Bedroom"]),
    threeBr: coerceNumber(row["Three-Bedroom"]),
    fourBr: coerceNumber(row["Four-Bedroom"]),
    year: year !== null ? Math.round(year) : null,
    areaName: typeof data.area_name === "string" ? data.area_name : null,
  };
  // At least the 2BR must resolve for the pull to be useful.
  if (rents.twoBr === null) return null;
  return rents;
}

export async function fetchFmr(
  entityId: string,
  year: number,
  fetchImpl?: FetchImpl,
): Promise<FmrRents | null> {
  const key = process.env.HUD_FMR_API_KEY;
  if (!key) {
    console.warn("  [hud] HUD_FMR_API_KEY absent — falling back");
    return null;
  }
  const json = await getJson(
    `https://www.huduser.gov/hudapi/public/fmr/data/${entityId}?year=${year}`,
    { label: "hud", headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, fetchImpl },
  );
  return json ? parseFmr(json) : null;
}

// ─────────────────────────────────────────────────────────────────────────
// 3. U.S. Census ACS 5-year — rent, income, population, mean commute
// ─────────────────────────────────────────────────────────────────────────

export type CensusAcs = {
  medianGrossRent: number | null;
  medianHouseholdIncome: number | null;
  population: number | null;
  meanCommuteMinutes: number | null;
};

export function parseCensusAcs(json: unknown): CensusAcs | null {
  if (!Array.isArray(json) || json.length < 2) return null;
  const header = json[0] as string[];
  const row = json[1] as string[];
  if (!Array.isArray(header) || !Array.isArray(row)) return null;
  const val = (code: string): unknown => {
    const i = header.indexOf(code);
    return i === -1 ? undefined : row[i];
  };
  const aggTravel = coerceCensus(val("B08013_001E"));
  const workers = coerceCensus(val("B08301_001E"));
  const meanCommute =
    aggTravel !== null && workers !== null && workers > 0
      ? Math.round(aggTravel / workers)
      : null;
  const result: CensusAcs = {
    medianGrossRent: coerceCensus(val("B25064_001E")),
    medianHouseholdIncome: coerceCensus(val("B19013_001E")),
    population: coerceCensus(val("B01003_001E")),
    meanCommuteMinutes: meanCommute,
  };
  // Useless if nothing resolved.
  if (
    result.medianGrossRent === null &&
    result.medianHouseholdIncome === null &&
    result.population === null
  ) {
    return null;
  }
  return result;
}

// ⚠ ANNUAL BUMP: ACS 5-year vintage — update when Census publishes the next release (AD-041).
const CENSUS_ACS_VINTAGE = 2023;

export async function fetchCensusAcs(
  stateFips: string,
  placeFips: string,
  fetchImpl?: FetchImpl,
): Promise<CensusAcs | null> {
  const key = process.env.CENSUS_API_KEY;
  // Census keyless path now returns "Missing Key" HTML (AD-030 re-probe), so a
  // key is effectively required; without it we fall back to modeled/authored.
  const vars = "NAME,B25064_001E,B19013_001E,B01003_001E,B08013_001E,B08301_001E";
  const keyParam = key ? `&key=${key}` : "";
  const json = await getJson(
    `https://api.census.gov/data/${CENSUS_ACS_VINTAGE}/acs/acs5?get=${vars}&for=place:${placeFips}&in=state:${stateFips}${keyParam}`,
    { label: "census", fetchImpl },
  );
  return json ? parseCensusAcs(json) : null;
}

// ─────────────────────────────────────────────────────────────────────────
// 4. EPA AirNow — current air-quality observation
// ─────────────────────────────────────────────────────────────────────────

const AQI_PARAM_SET = new Set(["O3", "PM2.5", "PM10", "NO2", "CO", "SO2"]);
const AQI_CATEGORY_SET = new Set([
  "Good",
  "Moderate",
  "Unhealthy for Sensitive Groups",
  "Unhealthy",
  "Very Unhealthy",
  "Hazardous",
]);

export type AirNowReading = { parameter: string; aqi: number; category: string };
export type AirNowSnapshot = {
  reportingArea: string;
  observedAt: string;
  readings: AirNowReading[];
  dominantParameter: string | null;
  aqi: number;
  category: string;
};

type AirNowRecord = {
  DateObserved?: string;
  HourObserved?: number;
  LocalTimeZone?: string;
  ReportingArea?: string;
  ParameterName?: string;
  AQI?: number;
  Category?: { Name?: string };
};

export function parseAirNow(json: unknown): AirNowSnapshot | null {
  if (!Array.isArray(json) || json.length === 0) return null;
  const records = json as AirNowRecord[];
  const readings: AirNowReading[] = [];
  for (const r of records) {
    const parameter = r.ParameterName;
    const aqi = r.AQI;
    const category = r.Category?.Name;
    if (
      typeof parameter === "string" &&
      AQI_PARAM_SET.has(parameter) &&
      typeof aqi === "number" &&
      typeof category === "string" &&
      AQI_CATEGORY_SET.has(category)
    ) {
      readings.push({ parameter, aqi, category });
    }
  }
  if (readings.length === 0) return null;
  const worst = readings.reduce((a, b) => (b.aqi > a.aqi ? b : a));
  const first = records[0];
  const date = (first.DateObserved ?? "").trim();
  const hour = String(first.HourObserved ?? 0).padStart(2, "0");
  const tz = first.LocalTimeZone ?? "";
  return {
    reportingArea: first.ReportingArea ?? "",
    observedAt: `${date} ${hour}:00 ${tz}`.trim(),
    readings,
    dominantParameter: worst.parameter,
    aqi: worst.aqi,
    category: worst.category,
  };
}

export async function fetchAirNow(
  lat: number,
  lng: number,
  fetchImpl?: FetchImpl,
): Promise<AirNowSnapshot | null> {
  const key = process.env.AIRNOW_API_KEY;
  if (!key) {
    console.warn("  [airnow] AIRNOW_API_KEY absent — falling back");
    return null;
  }
  const json = await getJson(
    `https://www.airnowapi.org/aq/observation/latLong/current/?format=application/json&latitude=${lat}&longitude=${lng}&distance=50&API_KEY=${key}`,
    { label: "airnow", fetchImpl },
  );
  return json ? parseAirNow(json) : null;
}

// ─────────────────────────────────────────────────────────────────────────
// 5. FEMA NFHL — flood-zone at a point (cross-check, no key)
// ─────────────────────────────────────────────────────────────────────────

export type NfhlZone = { floodZone: string; zoneSubtype: string | null; sfha: boolean };

type EsriResponse = { features?: { attributes?: Record<string, unknown> }[] };

export function parseNfhl(json: unknown): NfhlZone | null {
  const features = (json as EsriResponse)?.features;
  if (!Array.isArray(features) || features.length === 0) return null;
  const a = features[0]?.attributes;
  if (!a || typeof a.FLD_ZONE !== "string") return null;
  return {
    floodZone: a.FLD_ZONE,
    zoneSubtype: typeof a.ZONE_SUBTY === "string" ? a.ZONE_SUBTY : null,
    sfha: a.SFHA_TF === "T",
  };
}

export async function fetchNfhl(
  lat: number,
  lng: number,
  fetchImpl?: FetchImpl,
): Promise<NfhlZone | null> {
  const params = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "FLD_ZONE,ZONE_SUBTY,SFHA_TF",
    returnGeometry: "false",
    f: "json",
  });
  const json = await getJson(
    `https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?${params.toString()}`,
    { label: "nfhl", fetchImpl },
  );
  return json ? parseNfhl(json) : null;
}

// ─────────────────────────────────────────────────────────────────────────
// 6. FEMA National Risk Index — county hazard scores (cross-check, no key)
// ─────────────────────────────────────────────────────────────────────────

export type NriCounty = {
  county: string | null;
  overallScore: number | null;
  overallRating: string | null;
  wildfireScore: number | null;
  wildfireRating: string | null;
  wildfirePercentile: number | null;
  floodScore: number | null;
  floodRating: string | null;
  quakeScore: number | null;
  quakeRating: string | null;
};

export function parseNri(json: unknown): NriCounty | null {
  const features = (json as EsriResponse)?.features;
  if (!Array.isArray(features) || features.length === 0) return null;
  const a = features[0]?.attributes;
  if (!a) return null;
  const num = (k: string): number | null => coerceNumber(a[k]);
  const str = (k: string): string | null => (typeof a[k] === "string" ? (a[k] as string) : null);
  return {
    county: str("COUNTY"),
    overallScore: num("RISK_SCORE"),
    overallRating: str("RISK_RATNG"),
    wildfireScore: num("WFIR_RISKS"),
    wildfireRating: str("WFIR_RISKR"),
    wildfirePercentile: num("WFIR_ALR_NPCTL"),
    floodScore: num("RFLD_RISKS"),
    floodRating: str("RFLD_RISKR"),
    quakeScore: num("ERQK_RISKS"),
    quakeRating: str("ERQK_RISKR"),
  };
}

export async function fetchNri(
  countyFips: string,
  fetchImpl?: FetchImpl,
): Promise<NriCounty | null> {
  const where = encodeURIComponent(`STCOFIPS IN ('${countyFips}')`);
  const outFields = encodeURIComponent(
    "COUNTY,STATE,STCOFIPS,RISK_SCORE,RISK_RATNG,WFIR_RISKS,WFIR_RISKR,WFIR_ALR_NPCTL,RFLD_RISKS,RFLD_RISKR,ERQK_RISKS,ERQK_RISKR",
  );
  const json = await getJson(
    `https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Counties/FeatureServer/0/query?where=${where}&outFields=${outFields}&returnGeometry=false&f=json`,
    { label: "nri", fetchImpl },
  );
  return json ? parseNri(json) : null;
}

// ─────────────────────────────────────────────────────────────────────────
// 7. EPA National Walkability Index — block-group NatWalkInd, pop-weighted
// ─────────────────────────────────────────────────────────────────────────
//
// The EPA Smart Location Database's National Walkability Index, served live as
// an ArcGIS feature layer on EPA's GeoPlatform (public domain / CC0). Each
// Census block group carries a `NatWalkInd` on a 1–20 scale; we pull every
// block group within a box around the city centroid and population-weight
// (`TotPop`) them into one city score (verified live per AD-017). A spatial
// envelope — not a county filter — keeps Long Beach from inheriting all of LA
// County (the AD-017 over-broad-county trap; verified during the live run).

const EPA_WALK_URL =
  "https://geodata.epa.gov/arcgis/rest/services/OA/WalkabilityIndex/MapServer/0/query";
// ~0.09° ≈ 10 km half-width around the centroid. Each of the 3 reference cities
// fits in one page (<1000 block groups) with this box, so no pagination needed.
export const EPA_WALK_BBOX_DELTA = 0.09;

export type WalkabilityDerived = {
  score: number;
  category: "car-dependent" | "somewhat-walkable" | "very-walkable" | "walker-paradise";
  natWalkInd: number;
  blockGroupCount: number;
  population: number;
};

type EpaWalkResponse = {
  features?: { attributes?: { NatWalkInd?: number | string; TotPop?: number | string } }[];
};

/**
 * Population-weighted mean NatWalkInd across the returned block groups. Falls
 * back to a simple mean when no block group reports population. Returns null
 * when the response has no usable NatWalkInd values.
 */
export function parseEpaWalkability(
  json: unknown,
): { natWalkInd: number; blockGroupCount: number; population: number } | null {
  const features = (json as EpaWalkResponse)?.features;
  if (!Array.isArray(features) || features.length === 0) return null;

  let weightedSum = 0;
  let popSum = 0;
  let plainSum = 0;
  let count = 0;
  for (const f of features) {
    const nwi = coerceNumber(f.attributes?.NatWalkInd);
    if (nwi === null || nwi < 0) continue;
    const pop = coerceNumber(f.attributes?.TotPop);
    const p = pop !== null && pop > 0 ? pop : 0;
    weightedSum += nwi * p;
    popSum += p;
    plainSum += nwi;
    count += 1;
  }
  if (count === 0) return null;

  const mean = popSum > 0 ? weightedSum / popSum : plainSum / count;
  return {
    natWalkInd: Math.round(mean * 100) / 100,
    blockGroupCount: count,
    population: Math.round(popSum),
  };
}

/**
 * Map a 1–20 NatWalkInd to the 0–100 score + the four walkability bands. The
 * score cut points (25/50/75) correspond exactly to EPA's own NatWalkInd tier
 * boundaries (5.75 / 10.5 / 15.25), so the bands ARE EPA's "least / below-avg
 * / above-avg / most walkable" tiers expressed on the 0–100 scale.
 */
export function deriveEpaWalkability(parsed: {
  natWalkInd: number;
  blockGroupCount: number;
  population: number;
}): WalkabilityDerived {
  const score = Math.max(
    0,
    Math.min(100, Math.round(((parsed.natWalkInd - 1) / 19) * 100)),
  );
  const category =
    score > 75
      ? "walker-paradise"
      : score > 50
        ? "very-walkable"
        : score > 25
          ? "somewhat-walkable"
          : "car-dependent";
  return { score, category, ...parsed };
}

export async function fetchEpaWalkability(
  lat: number,
  lng: number,
  fetchImpl?: FetchImpl,
): Promise<WalkabilityDerived | null> {
  const d = EPA_WALK_BBOX_DELTA;
  const params = new URLSearchParams({
    geometry: `${lng - d},${lat - d},${lng + d},${lat + d}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    where: "1=1",
    outFields: "NatWalkInd,TotPop",
    returnGeometry: "false",
    resultRecordCount: "1000",
    f: "json",
  });
  const json = await getJson(`${EPA_WALK_URL}?${params.toString()}`, {
    label: "epa-walkability",
    headers: { "User-Agent": "Reloca/1.0 (single-user relocation dashboard)" },
    timeoutMs: 30_000,
    fetchImpl,
  });
  if (!json) return null;
  const parsed = parseEpaWalkability(json);
  return parsed === null ? null : deriveEpaWalkability(parsed);
}
