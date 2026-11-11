// Round-trip + loader-shape assertions for the genericized reference schemas
// and the provenance layer (Wave A: A.2 + A.3), extended in Wave B (AD-030) to
// cover Sacramento and the ingested air-quality / walkability domains. The
// Wave A byte-identical regression gate was removed once Wave B's real numbers
// landed (its genericization purpose was discharged).
//
// Run via: `npx tsx lib/data/reference-schemas.test.ts`

import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import {
  CostCategorySchema,
  CommunityInsightFileSchema,
  CrimeRecordSchema,
  ClimateProfileSchema,
  PropertySchema,
  DataSourceSchema,
  AirQualityProfileSchema,
  WalkabilityProfileSchema,
} from "@/schemas";
import { getCostOfLiving, costValueFor } from "./cost";
import { getCommunityInsights } from "./community";
import { getAllCrimeRecords } from "./crime";
import { getAllClimateProfiles } from "./climate";
import { getProperties } from "./properties";
import { getDataSources, getDataSource } from "./data-sources";
import { getAirQualityProfile } from "./air-quality";
import { getWalkabilityProfile } from "./walkability";
import { buildNeighborhoodCompareRows } from "./neighborhood-compare";

// ── cost: slug-keyed values[] replaces the named columns ───────────────

const cat = CostCategorySchema.parse({
  category: "housing",
  values: [
    { city: "denver", monthlyMedian: 2100 },
    { city: "long-beach", monthlyMedian: 2650 },
  ],
  notes: "test",
  source: "cost-modeled-2025",
});
assert.equal(costValueFor(cat, "denver"), 2100, "costValueFor reads by slug");
assert.equal(costValueFor(cat, "long-beach"), 2650);
assert.equal(costValueFor(cat, "sacramento"), 0, "absent city → 0");
assert.throws(
  () => CostCategorySchema.parse({ category: "housing", values: "nope" }),
  "rejects malformed values",
);

// ── community: .length(2) is gone — arbitrary city count parses ────────

const communityFixtureCity = (slug: string) => ({
  city: slug,
  avgRent: [
    { unit: "studio", median: 1 },
    { unit: "1br", median: 1 },
    { unit: "2br", median: 1 },
    { unit: "3br", median: 1 },
  ],
  weatherSummary: "x",
  vibeTags: ["a", "b"],
  testimonials: [
    { author: "a", role: "r", neighborhood: "n", quote: "a quote long enough to pass min" },
    { author: "b", role: "r", neighborhood: "n", quote: "another quote long enough to pass" },
  ],
});
CommunityInsightFileSchema.parse([
  communityFixtureCity("denver"),
  communityFixtureCity("long-beach"),
  communityFixtureCity("sacramento"),
]);

// ── crime / climate / property accept a slug city (no longer an enum) ──

CrimeRecordSchema.parse({ ...getAllCrimeRecords().denver, city: "sacramento" });
ClimateProfileSchema.parse({ ...getAllClimateProfiles().denver, city: "sacramento" });
PropertySchema.parse({
  id: "sac-midtown-1br",
  city: "sacramento",
  neighborhood: "Midtown",
  address: "1 K St",
  listingType: "rent",
  beds: 1,
  baths: 1,
  sqft: 600,
  price: 1800,
  coordinates: { lat: 38.57, lng: -121.48 },
  seaProximityKm: 0,
  imageUrl: "/x.jpg",
  climateProfileRef: "sacramento",
  crimeRecordRef: "sacramento",
});

// ── DataSource round-trip + tier guard ────────────────────────────────

DataSourceSchema.parse({
  id: "x",
  label: "X",
  provider: "P",
  url: "https://example.com",
  tier: "modeled",
  fetchedAt: "2025-04-01",
});
assert.throws(
  () =>
    DataSourceSchema.parse({
      id: "x",
      label: "X",
      provider: "P",
      url: "https://example.com",
      tier: "guesstimate",
      fetchedAt: "2025-04-01",
    }),
  "rejects an unknown tier",
);

// ── Loaders return the new shape with provenance fully populated ───────

const cost = getCostOfLiving();
assert.ok(
  cost.categories.every((c) => Array.isArray(c.values) && c.source),
  "every cost category carries values[] + a source",
);

// Every reference record carries a source, and every used source id resolves
// in the registry.
const usedSources = new Set<string>();
for (const c of cost.categories) if (c.source) usedSources.add(c.source);
for (const c of getCommunityInsights()) {
  assert.ok(c.source, `community ${c.city} has a source`);
  usedSources.add(c.source);
}
const crimes = getAllCrimeRecords();
for (const r of [crimes.denver, crimes.longBeach]) {
  assert.ok(r.source, `crime ${r.city} has a source`);
  usedSources.add(r.source);
}
const climates = getAllClimateProfiles();
for (const r of [climates.denver, climates.longBeach]) {
  assert.ok(r.source, `climate ${r.city} has a source`);
  usedSources.add(r.source);
}
for (const p of getProperties()) {
  assert.ok(p.source, `property ${p.id} has a source`);
  usedSources.add(p.source);
}

assert.ok(usedSources.size > 0, "reference data actually carries source tags");
for (const id of usedSources) {
  assert.ok(getDataSource(id), `source "${id}" must exist in data/data-sources.json`);
}
assert.ok(getDataSources().length >= usedSources.size, "registry covers used sources");

// ── Wave D guard: saved-neighborhood join survives the slug genericization ──
// saved_neighborhoods.city stores DISPLAY names ("Long Beach"); properties now
// carry city slugs ("long-beach"). The compare aggregator resolves the slug to
// its display name to join. This proves that join still matches a real row.
{
  const savedRow = {
    id: "00000000-0000-0000-0000-000000000000",
    user_id: "00000000-0000-0000-0000-000000000000",
    neighborhood: "Belmont Shore",
    city: "Long Beach",
    notes: null,
    created_at: "2026-05-30T00:00:00.000+00:00",
  };
  const view = buildNeighborhoodCompareRows([savedRow], getProperties());
  assert.ok(view, "saved-compare view builds for a Long Beach saved row");
  const col = view!.columns.find((c) => c.neighborhood === "Belmont Shore");
  assert.ok(col, "join matched a slug-city property to the display-name saved row");
  assert.ok(
    col!.listingCount > 0,
    "matched listings (join did not silently drop the row)",
  );
}

// ── Phase 8 Wave B: Sacramento + ingested live domains validate + resolve ──
// The crime/climate loaders are still slug-hardcoded to denver|long-beach
// (Wave C widens them), so Sacramento's files are validated directly here.
const SLUGS = ["denver", "long-beach", "sacramento"] as const;

const sacCrime = CrimeRecordSchema.parse(
  JSON.parse(readFileSync(join(process.cwd(), "data/crime/sacramento.json"), "utf-8")),
);
assert.equal(sacCrime.city, "sacramento", "sacramento crime record is slug-keyed");
assert.ok(sacCrime.source && getDataSource(sacCrime.source), "sacramento crime source resolves");
usedSources.add(sacCrime.source!);

const sacClimate = ClimateProfileSchema.parse(
  JSON.parse(readFileSync(join(process.cwd(), "data/climate/sacramento.json"), "utf-8")),
);
assert.equal(sacClimate.city, "sacramento");
assert.equal(sacClimate.flood.femaTier, "AE", "sacramento carries its real (levee) flood exposure");
assert.ok(sacClimate.source && getDataSource(sacClimate.source), "sacramento climate source resolves");
usedSources.add(sacClimate.source!);

// Cost + community now carry Sacramento alongside the two existing cities.
assert.equal(costValueFor(getCostOfLiving().categories[0], "sacramento") > 0, true, "cost has a sacramento housing value");
assert.ok(getCommunityInsights().some((c) => c.city === "sacramento"), "community has a sacramento record");

// air-quality + walkability ingested snapshots validate against their schemas
// and every populated source resolves in the registry.
for (const slug of SLUGS) {
  const aq = getAirQualityProfile(slug);
  if (aq) {
    AirQualityProfileSchema.parse(aq);
    assert.equal(aq.city, slug);
    assert.ok(aq.source && getDataSource(aq.source), `air-quality ${slug} source resolves`);
    usedSources.add(aq.source!);
  }
  const wk = getWalkabilityProfile(slug);
  if (wk) {
    WalkabilityProfileSchema.parse(wk);
    assert.equal(wk.city, slug);
    assert.ok(wk.source && getDataSource(wk.source), `walkability ${slug} source resolves`);
    usedSources.add(wk.source!);
  }
}

// Re-run the registry-resolution guard now that the Wave B sources are folded in.
for (const id of usedSources) {
  assert.ok(getDataSource(id), `source "${id}" must exist in data/data-sources.json`);
}

console.log("✅ reference-schemas.test.ts passed");
