// Fixture-based tests for the Phase 8 ingestion fetchers (AD-030).
//
// No live network calls: each parser is exercised against a saved
// real-shaped fixture (success) and against malformed input (graceful → null),
// and the shared `getJson` is driven by an injected fetch to prove every
// source degrades to null on network / HTTP / decode failure.
//
// Run: `npx tsx scripts/lib/fetchers.test.ts`

import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import {
  getJson,
  parseNoaaNormals,
  fetchNoaaNormals,
  parseFmr,
  parseCensusAcs,
  parseAirNow,
  parseNfhl,
  parseNri,
  parseEpaWalkability,
  deriveEpaWalkability,
  fetchEpaWalkability,
  type FetchImpl,
} from "./fetchers";

const FIX = join(process.cwd(), "scripts/__fixtures__");
const load = (name: string): unknown =>
  JSON.parse(readFileSync(join(FIX, name), "utf-8"));

// Fake fetch builders for the getJson failure-mode tests.
const fakeResponse = (init: { ok: boolean; status?: number; json?: () => Promise<unknown> }) =>
  ({ ok: init.ok, status: init.status ?? (init.ok ? 200 : 500), json: init.json ?? (async () => ({})) }) as Response;
const fetchOk = (body: unknown): FetchImpl => (async () => fakeResponse({ ok: true, json: async () => body })) as FetchImpl;
const fetchHttpErr: FetchImpl = (async () => fakeResponse({ ok: false, status: 503 })) as FetchImpl;
const fetchThrows: FetchImpl = (async () => {
  throw new Error("network down");
}) as FetchImpl;
const fetchBadJson: FetchImpl = (async () =>
  fakeResponse({
    ok: true,
    json: async () => {
      throw new Error("not json");
    },
  })) as FetchImpl;

async function main() {
// ── NOAA ───────────────────────────────────────────────────────────────
{
  const ok = parseNoaaNormals(load("noaa-denver.json"));
  assert.deepEqual(ok, {
    avgHighF: 64,
    avgLowF: 36,
    annualPrecipitationIn: 15.6,
    heatDaysPerYear: 31,
  });
  assert.equal(parseNoaaNormals({ results: [] }), null, "noaa: empty → null");
  assert.equal(
    parseNoaaNormals({ results: [{ datatype: "ANN-TMAX-NORMAL", value: 64 }] }),
    null,
    "noaa: missing datatypes → null",
  );
  assert.equal(parseNoaaNormals(null), null, "noaa: null → null");
}

// ── HUD FMR ────────────────────────────────────────────────────────────
{
  const ok = parseFmr(load("hud-denver.json"));
  assert.ok(ok);
  assert.equal(ok!.twoBr, 2089, "hud: 2BR coerced from string");
  assert.equal(ok!.oneBr, 1754);
  assert.equal(ok!.year, 2026);
  assert.equal(ok!.areaName, "Denver-Aurora-Centennial, CO MSA");
  assert.equal(parseFmr({}), null, "hud: no data → null");
  assert.equal(parseFmr({ data: { basicdata: { "One-Bedroom": "100" } } }), null, "hud: no 2BR → null");
}

// ── Census ACS ─────────────────────────────────────────────────────────
{
  const ok = parseCensusAcs(load("census-denver.json"));
  assert.ok(ok);
  assert.equal(ok!.medianGrossRent, 1770);
  assert.equal(ok!.medianHouseholdIncome, 91681);
  assert.equal(ok!.population, 713734);
  assert.equal(ok!.meanCommuteMinutes, 25, "census: mean commute = aggTravel / workers");
  assert.equal(parseCensusAcs([["NAME"]]), null, "census: header-only → null");
  assert.equal(
    parseCensusAcs([
      ["B25064_001E", "B19013_001E", "B01003_001E"],
      ["-666666666", "-666666666", "-666666666"],
    ]),
    null,
    "census: all sentinel values → null",
  );
}

// ── AirNow ─────────────────────────────────────────────────────────────
{
  const ok = parseAirNow(load("airnow-denver.json"));
  assert.ok(ok);
  assert.equal(ok!.aqi, 97, "airnow: headline = worst parameter");
  assert.equal(ok!.category, "Moderate");
  assert.equal(ok!.dominantParameter, "O3");
  assert.equal(ok!.readings.length, 3);
  assert.equal(ok!.reportingArea, "Denver-Boulder");
  assert.equal(ok!.observedAt, "2026-05-30 14:00 MST", "airnow: trailing-space date trimmed");
  assert.equal(parseAirNow([]), null, "airnow: empty → null");
  assert.equal(parseAirNow([{ ParameterName: "XYZ", AQI: 5 }]), null, "airnow: unknown param → null");
}

// ── FEMA NFHL ──────────────────────────────────────────────────────────
{
  const ok = parseNfhl(load("nfhl-denver.json"));
  assert.deepEqual(ok, { floodZone: "X", zoneSubtype: "AREA OF MINIMAL FLOOD HAZARD", sfha: false });
  assert.equal(parseNfhl({ features: [] }), null, "nfhl: no features → null");
}

// ── FEMA NRI ───────────────────────────────────────────────────────────
{
  const ok = parseNri(load("nri-denver.json"));
  assert.ok(ok);
  assert.equal(ok!.wildfireScore, 60.62);
  assert.equal(ok!.overallRating, "Relatively High");
  assert.equal(ok!.county, "Denver");
  assert.equal(parseNri({ features: [] }), null, "nri: no features → null");
}

// ── EPA National Walkability Index ─────────────────────────────────────
{
  const p = parseEpaWalkability(load("epa-walkability.json"));
  assert.equal(p?.natWalkInd, 12.09, "epa: population-weighted NatWalkInd (numeric + string coerced)");
  assert.equal(p?.blockGroupCount, 4, "epa: counts every block group with a valid index");
  assert.equal(p?.population, 3534, "epa: population is the weighting denominator");
  assert.equal(parseEpaWalkability({ features: [] }), null, "epa: no features → null");
  assert.equal(parseEpaWalkability({}), null, "epa: malformed → null");

  // Simple-mean fallback when no block group reports population.
  const noPop = parseEpaWalkability({
    features: [{ attributes: { NatWalkInd: 10 } }, { attributes: { NatWalkInd: 12 } }],
  });
  assert.equal(noPop?.natWalkInd, 11, "epa: falls back to simple mean with no population");
  assert.equal(noPop?.population, 0);

  const d = deriveEpaWalkability({ natWalkInd: 12.09, blockGroupCount: 4, population: 3534 });
  assert.equal(d.score, 58, "epa: NatWalkInd 12.09 → score 58");
  assert.equal(d.category, "very-walkable");
  assert.equal(deriveEpaWalkability({ natWalkInd: 1, blockGroupCount: 1, population: 1 }).score, 0, "epa: NatWalkInd 1 → 0");
  assert.equal(deriveEpaWalkability({ natWalkInd: 1, blockGroupCount: 1, population: 1 }).category, "car-dependent");
  assert.equal(deriveEpaWalkability({ natWalkInd: 20, blockGroupCount: 1, population: 1 }).score, 100, "epa: NatWalkInd 20 → 100");
  assert.equal(deriveEpaWalkability({ natWalkInd: 20, blockGroupCount: 1, population: 1 }).category, "walker-paradise");

  // fetch* wiring: injected fetch returns the derived profile; failures → null.
  const piped = await fetchEpaWalkability(33.77, -118.19, fetchOk(load("epa-walkability.json")));
  assert.equal(piped?.score, 58, "epa: fetch→parse→derive pipeline");
  assert.equal(await fetchEpaWalkability(33.77, -118.19, fetchHttpErr), null, "epa: HTTP error → null");
  assert.equal(await fetchEpaWalkability(33.77, -118.19, fetchThrows), null, "epa: network throw → null");
}

// ── getJson failure modes (covers every source's network/HTTP/decode path) ──
{
  const okBody = await getJson("https://x.test", { label: "t", fetchImpl: fetchOk({ ok: 1 }) });
  assert.deepEqual(okBody, { ok: 1 }, "getJson: returns decoded body on 200");
  assert.equal(await getJson("https://x.test", { label: "t", fetchImpl: fetchHttpErr }), null, "getJson: non-2xx → null");
  assert.equal(await getJson("https://x.test", { label: "t", fetchImpl: fetchThrows }), null, "getJson: throw → null");
  assert.equal(await getJson("https://x.test", { label: "t", fetchImpl: fetchBadJson }), null, "getJson: bad json → null");
}

// ── fetch* pipeline wiring (env-gated + injected fetch) ─────────────────
{
  const saved = process.env.NOAA_CDO_TOKEN;
  delete process.env.NOAA_CDO_TOKEN;
  assert.equal(await fetchNoaaNormals("GHCND:X", fetchOk(load("noaa-denver.json"))), null, "noaa: no token → null (no leak)");
  process.env.NOAA_CDO_TOKEN = "test-token-not-real";
  const piped = await fetchNoaaNormals("GHCND:X", fetchOk(load("noaa-denver.json")));
  assert.equal(piped?.avgHighF, 64, "noaa: fetch→parse pipeline returns parsed normals");
  if (saved === undefined) delete process.env.NOAA_CDO_TOKEN;
  else process.env.NOAA_CDO_TOKEN = saved;
}
}

main()
  .then(() => console.log("✅ scripts/lib/fetchers.test.ts passed"))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
