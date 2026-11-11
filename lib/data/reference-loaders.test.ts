// Slug-generic reference-loader assertions (Phase 8 Wave C, C.1).
// Run via: `npx tsx lib/data/reference-loaders.test.ts`
//
// Proves the four per-city reference loaders resolve + validate for EVERY slug
// in the registry — not just denver/long-beach. This is the C.1 unlock: until
// these widened past the two-city hardcode, Sacramento data existed but could
// never render. Mirrors the cities.test.ts idiom (self-contained node script,
// exits non-zero on failure; reads the real data files so it doubles as a
// fixture-validity check).

import assert from "node:assert/strict";
import {
  CrimeRecordSchema,
  ClimateProfileSchema,
  AirQualityProfileSchema,
  WalkabilityProfileSchema,
} from "@/schemas";
import { getCities } from "./cities";
import { getCrimeRecord } from "./crime";
import { getClimateProfile } from "./climate";
import { getAirQualityProfile } from "./air-quality";
import { getWalkabilityProfile } from "./walkability";

// Every city in the registry must load + validate across all four domains.
const slugs = getCities().map((c) => c.slug);
assert.ok(
  slugs.includes("sacramento"),
  "registry includes sacramento (the city the C.1 widening unlocks)",
);

for (const slug of slugs) {
  const crime = getCrimeRecord(slug);
  CrimeRecordSchema.parse(crime);
  assert.equal(crime.city, slug, `crime record city matches slug for ${slug}`);

  const climate = getClimateProfile(slug);
  ClimateProfileSchema.parse(climate);
  assert.equal(climate.city, slug, `climate profile city matches slug for ${slug}`);

  const air = getAirQualityProfile(slug);
  assert.ok(air, `air-quality snapshot present for ${slug}`);
  AirQualityProfileSchema.parse(air);
  assert.equal(air!.city, slug, `air-quality city matches slug for ${slug}`);

  const walk = getWalkabilityProfile(slug);
  assert.ok(walk, `walkability profile present for ${slug}`);
  WalkabilityProfileSchema.parse(walk);
  assert.equal(walk!.city, slug, `walkability city matches slug for ${slug}`);
}

// Unknown slug fails loud (clear error, not a raw ENOENT).
assert.throws(
  () => getCrimeRecord("atlantis"),
  /No crime data for city "atlantis"/,
  "unknown crime slug throws a friendly error",
);
assert.throws(
  () => getClimateProfile("atlantis"),
  /No climate data for city "atlantis"/,
  "unknown climate slug throws a friendly error",
);

console.log(`✅ reference-loaders.test.ts passed (${slugs.length} cities × 4 domains)`);
