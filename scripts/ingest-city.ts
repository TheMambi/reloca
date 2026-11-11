// Phase 8 Wave B city-data ingestion (AD-030).
//
//   npx tsx --env-file=.env.local scripts/ingest-city.ts <slug>
//   npx tsx --env-file=.env.local scripts/ingest-city.ts all
//
// Calls the free APIs and writes per-city JSON snapshots with honest `source`
// tiers. It is a LIVE OVERLAY over hand-authored data: the modeled fields
// (crime, climate hazards, most cost categories, community) stay authored in the
// data files; this script refreshes only the fields a clean free API supplies:
//   - NOAA climate normals        → climate/<slug>.json temps        (live)
//   - HUD Fair Market Rent (2BR)   → cost-of-living.json housing      (live)
//   - EPA AirNow current AQI       → air-quality/<slug>.json          (live)
//   - EPA Walkability Index        → walkability/<slug>.json          (live)
// Census ACS, FEMA NFHL, and FEMA NRI are fetched as cross-checks and logged
// (the hazard fields are hand-verified per AD-030, not auto-written, because the
// point/county grain of those APIs misreads at city grain).
//
// Best-effort: every source is wrapped so one outage never aborts the run; a
// failed live source falls back to the existing modeled value + tier. Re-run to
// refresh, or to onboard a new city after its modeled base is authored.
//
// SECURITY: API keys are read from process.env (loaded from .env.local) and
// never logged or written. No secret reaches stdout or any data file.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import {
  CitiesFileSchema,
  ClimateProfileSchema,
  CostOfLivingSchema,
  AirQualityProfileSchema,
  WalkabilityProfileSchema,
  DataSourcesFileSchema,
} from "@/schemas";
import type { City, DataSource } from "@/schemas";
import {
  fetchNoaaNormals,
  fetchFmr,
  fetchCensusAcs,
  fetchAirNow,
  fetchEpaWalkability,
  fetchNfhl,
  fetchNri,
} from "./lib/fetchers";

// Best-effort env hydration so the bare `npx tsx scripts/ingest-city.ts` form
// works too (the `--env-file=.env.local` flag is the documented path).
try {
  process.loadEnvFile(join(process.cwd(), ".env.local"));
} catch {
  // already loaded via --env-file, or absent — fetchers degrade to modeled.
}

// ⚠ ANNUAL BUMP REQUIRED: HUD publishes a new FMR dataset each fiscal year and
// the live source ids below are year-suffixed ("rent-hud-fmr-2026" etc.). When
// the year changes, bump this constant AND mint fresh source ids/labels, or
// the provenance tags silently lie about the vintage (AD-041).
const FMR_YEAR = 2026;
const TODAY = new Date().toISOString().slice(0, 10);

// County FIPS for the FEMA NRI cross-check (not in cities.json — NRI is a
// logged cross-check, not a written field).
const COUNTY_FIPS: Record<string, string> = {
  denver: "08031",
  "long-beach": "06037",
  sacramento: "06067",
};

// Live/derived DataSource definitions this script can attach to a field. Upserted
// into data/data-sources.json with a fresh `fetchedAt` whenever the pull succeeds.
const LIVE_SOURCES: Record<string, Omit<DataSource, "fetchedAt">> = {
  noaa: {
    id: "climate-noaa-2026",
    label: "NOAA climate normals",
    provider: "NOAA National Centers for Environmental Information",
    url: "https://www.ncei.noaa.gov/cdo-web/",
    tier: "live",
    notes:
      "Average high/low temperature, annual precipitation, and days at or above 90°F are pulled live from NOAA's climate normals (CDO NORMAL_ANN product — the 1981–2010 normals vintage; the newer 1991–2020 set isn't served by this endpoint). The flood, wildfire, earthquake, and sea-level fields in each climate profile are hand-verified estimates, cross-checked against FEMA NFHL/NRI and USGS (modeled).",
  },
  hud: {
    id: "rent-hud-fmr-2026",
    label: "HUD Fair Market Rent",
    provider: "U.S. Department of Housing and Urban Development",
    url: "https://www.huduser.gov/portal/dataset/fmr-api.html",
    tier: "live",
    notes: "Two-bedroom Fair Market Rent for the metro area, fiscal year 2026.",
  },
  airnow: {
    id: "air-quality-airnow-2026",
    label: "EPA AirNow",
    provider: "U.S. Environmental Protection Agency — AirNow",
    url: "https://www.airnow.gov/",
    tier: "live",
    notes:
      "Current air-quality observation for the city's reporting area — a point-in-time reading stamped with its local observation time, not a rolling average.",
  },
  epaWalk: {
    id: "walkability-epa-2026",
    label: "EPA National Walkability Index",
    provider: "U.S. Environmental Protection Agency — Smart Location Database",
    url: "https://www.epa.gov/smartgrowth/smart-location-mapping",
    tier: "live",
    notes:
      "Population-weighted mean of the EPA National Walkability Index (NatWalkInd, 1–20 scale) across Census block groups within ~10 km of the city centroid, served live from EPA's GeoPlatform ArcGIS feature service (public domain / CC0). Mapped to a 0–100 score; the 25/50/75 category cuts are EPA's own walkability tier boundaries. Block-group geography vintage 2018.",
  },
};

function loadCities(): City[] {
  return CitiesFileSchema.parse(
    JSON.parse(readFileSync(join(process.cwd(), "data/cities.json"), "utf-8")),
  );
}

function writeJson(relPath: string, value: unknown): void {
  const abs = join(process.cwd(), relPath);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

/** Upsert a live DataSource into data/data-sources.json with today's fetchedAt. */
function recordSource(key: keyof typeof LIVE_SOURCES): void {
  const path = join(process.cwd(), "data/data-sources.json");
  const sources = DataSourcesFileSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
  const entry: DataSource = { ...LIVE_SOURCES[key], fetchedAt: TODAY };
  const i = sources.findIndex((s) => s.id === entry.id);
  if (i === -1) sources.push(entry);
  else sources[i] = entry;
  writeJson("data/data-sources.json", sources);
}

async function ingestCity(city: City): Promise<void> {
  const { slug, metro } = city;
  console.log(`\n▶ Ingesting ${city.displayName} (${slug})`);

  // ── Climate: overlay NOAA normals onto the authored hazard profile ──────
  const climatePath = `data/climate/${slug}.json`;
  if (existsSync(join(process.cwd(), climatePath))) {
    const climate = ClimateProfileSchema.parse(
      JSON.parse(readFileSync(join(process.cwd(), climatePath), "utf-8")),
    );
    const noaa = await fetchNoaaNormals(metro.noaaStationId);
    if (noaa) {
      climate.avgHighF = noaa.avgHighF;
      climate.avgLowF = noaa.avgLowF;
      climate.annualPrecipitationIn = noaa.annualPrecipitationIn;
      climate.heatDaysPerYear = noaa.heatDaysPerYear;
      climate.source = LIVE_SOURCES.noaa.id;
      recordSource("noaa");
      console.log(
        `  climate ← NOAA: ${noaa.avgHighF}/${noaa.avgLowF}°F, ${noaa.annualPrecipitationIn}in, ${noaa.heatDaysPerYear} hot days (live)`,
      );
    } else {
      if (climate.source === LIVE_SOURCES.noaa.id) climate.source = "climate-modeled-2025";
      console.log("  climate ← NOAA unavailable; kept authored temps (modeled)");
    }
    writeJson(climatePath, ClimateProfileSchema.parse(climate));
  } else {
    console.log(`  climate: no authored ${climatePath} — skipped`);
  }

  // ── Cost housing: overlay HUD 2BR Fair Market Rent ──────────────────────
  const costPath = "data/cost-of-living.json";
  const cost = CostOfLivingSchema.parse(
    JSON.parse(readFileSync(join(process.cwd(), costPath), "utf-8")),
  );
  const housing = cost.categories.find((c) => c.category === "housing");
  const fmr = await fetchFmr(metro.hudEntityId, FMR_YEAR);
  if (housing && fmr?.twoBr) {
    const v = housing.values.find((x) => x.city === slug);
    if (v) v.monthlyMedian = fmr.twoBr;
    else housing.values.push({ city: slug, monthlyMedian: fmr.twoBr });
    housing.source = LIVE_SOURCES.hud.id;
    housing.notes = `Two-bedroom HUD Fair Market Rent (FY${fmr.year ?? FMR_YEAR}) per metro area — the federal yardstick for typical metro rent.`;
    // asOf tracks the file's most recent refresh; leaving it frozen at the
    // authoring date made the HUD overlay look 15 months old (AD-041).
    cost.asOf = TODAY;
    recordSource("hud");
    writeJson(costPath, CostOfLivingSchema.parse(cost));
    console.log(`  cost.housing ← HUD 2BR: $${fmr.twoBr} (live, ${fmr.areaName ?? "metro"})`);
  } else {
    console.log("  cost.housing ← HUD unavailable; kept authored value (modeled)");
  }

  // ── Air quality: write the AirNow snapshot wholesale ────────────────────
  const airnow = await fetchAirNow(city.lat, city.lng);
  if (airnow) {
    const profile = AirQualityProfileSchema.parse({
      city: slug,
      reportingArea: airnow.reportingArea,
      observedAt: airnow.observedAt,
      dominantParameter: airnow.dominantParameter,
      aqi: airnow.aqi,
      category: airnow.category,
      readings: airnow.readings,
      source: LIVE_SOURCES.airnow.id,
    });
    writeJson(`data/air-quality/${slug}.json`, profile);
    recordSource("airnow");
    console.log(`  air-quality ← AirNow: AQI ${airnow.aqi} ${airnow.category} (${airnow.dominantParameter}) @ ${airnow.observedAt} (live)`);
  } else {
    console.log("  air-quality ← AirNow returned nothing (off-hours?); no snapshot written");
  }

  // ── Walkability: write the EPA National Walkability Index wholesale ─────
  const walk = await fetchEpaWalkability(city.lat, city.lng);
  if (walk) {
    const profile = WalkabilityProfileSchema.parse({
      city: slug,
      score: walk.score,
      category: walk.category,
      natWalkInd: walk.natWalkInd,
      blockGroupCount: walk.blockGroupCount,
      population: walk.population,
      source: LIVE_SOURCES.epaWalk.id,
    });
    writeJson(`data/walkability/${slug}.json`, profile);
    recordSource("epaWalk");
    console.log(
      `  walkability ← EPA index: ${walk.score}/100 ${walk.category} (NatWalkInd ${walk.natWalkInd}, ${walk.blockGroupCount} block groups, pop ${walk.population}) (live)`,
    );
  } else {
    console.log("  walkability ← EPA index unavailable; no profile written");
  }

  // ── Cross-checks (logged, not written; inform the hand-verified fields) ──
  const [census, nfhl, nri] = await Promise.all([
    fetchCensusAcs(metro.censusPlaceFips.slice(0, 2), metro.censusPlaceFips.slice(2)),
    fetchNfhl(city.lat, city.lng),
    fetchNri(COUNTY_FIPS[slug] ?? ""),
  ]);
  if (census) {
    console.log(
      `  ⓘ Census ACS cross-check: rent $${census.medianGrossRent}, income $${census.medianHouseholdIncome}, pop ${census.population}, commute ${census.meanCommuteMinutes}min`,
    );
  }
  if (nfhl) {
    console.log(`  ⓘ FEMA NFHL cross-check (centroid): flood zone ${nfhl.floodZone}${nfhl.sfha ? " (SFHA)" : ""}`);
  }
  if (nri) {
    console.log(
      `  ⓘ FEMA NRI cross-check (county): overall ${nri.overallRating} (${nri.overallScore}), wildfire ${nri.wildfireRating} (${nri.wildfireScore}, ${nri.wildfirePercentile} pctile)`,
    );
  }
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg) {
    console.error("usage: tsx scripts/ingest-city.ts <slug|all>");
    process.exit(1);
  }
  const cities = loadCities();
  const targets =
    arg === "all" ? cities : cities.filter((c) => c.slug === arg);
  if (targets.length === 0) {
    console.error(`unknown city slug "${arg}". Known: ${cities.map((c) => c.slug).join(", ")}`);
    process.exit(1);
  }
  for (const city of targets) {
    await ingestCity(city);
  }
  console.log(`\n✅ Ingestion complete for ${targets.map((c) => c.slug).join(", ")} (fetched ${TODAY}).`);
}

main().catch((err) => {
  console.error("ingestion failed:", err);
  process.exit(1);
});
