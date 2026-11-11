// Round-trip + loader assertions for the city registry (Wave A.1).
// Run via: `npx tsx lib/data/cities.test.ts`
//
// Mirrors lib/data/move-readiness.test.ts — self-contained node script that
// exits non-zero on assertion failure. Reads the real data/cities.json via the
// loader (cwd must be the repo root), so it doubles as a fixture-validity check.

import assert from "node:assert/strict";
import { CitySchema, CitiesFileSchema } from "@/schemas";
import { getCities, getCity, cityName, cityCode } from "./cities";

// ── Schema round-trip: a valid city parses ─────────────────────────────

const valid = {
  slug: "denver",
  displayName: "Denver",
  stateCode: "CO",
  routeCode: "DEN",
  lat: 39.7392,
  lng: -104.9903,
  population: 713252,
  metro: {
    hudEntityId: "METRO19740M19740",
    censusPlaceFips: "0820000",
    noaaStationId: "GHCND:USW00023062",
  },
};
assert.deepEqual(CitySchema.parse(valid), valid, "valid city round-trips");

// ── Schema rejects malformed input ─────────────────────────────────────

assert.throws(
  () => CitySchema.parse({ ...valid, slug: "Long Beach" }),
  "rejects non-kebab slug",
);
assert.throws(
  () => CitySchema.parse({ ...valid, stateCode: "CALIF" }),
  "rejects state code that is not 2 chars",
);
assert.throws(
  () => CitySchema.parse({ ...valid, routeCode: "DENVER" }),
  "rejects route code that is not 3 chars",
);
assert.throws(
  () => CitySchema.parse({ ...valid, population: -1 }),
  "rejects non-positive population",
);
assert.throws(
  () => CitySchema.parse({ ...valid, metro: { hudEntityId: "x" } }),
  "rejects incomplete metro block",
);

// ── Loader: data/cities.json validates and seeds the three-city pool ───

const cities = getCities();
assert.equal(cities.length, 3, "three cities seeded");
assert.deepEqual(
  cities.map((c) => c.slug).sort(),
  ["denver", "long-beach", "sacramento"],
  "seeded slugs are denver / long-beach / sacramento",
);
// Re-parse to assert every row is schema-valid (loader already parses, but
// this fails loud if the file ever drifts from the schema).
CitiesFileSchema.parse(cities);

// ── Route codes + the AD-017-confirmed HUD entity ──────────────────────

assert.equal(cityCode("denver"), "DEN");
assert.equal(cityCode("long-beach"), "LGB");
assert.equal(cityCode("sacramento"), "SAC");
assert.equal(
  getCity("long-beach")?.metro.hudEntityId,
  "METRO31080MM4480",
  "Long Beach HUD entity matches the AD-017 correction",
);

// ── Lookup helpers + graceful fallback on unknown slug ─────────────────

assert.equal(cityName("long-beach"), "Long Beach");
assert.equal(getCity("atlantis"), undefined, "unknown slug returns undefined");
assert.equal(cityName("atlantis"), "atlantis", "cityName falls back to slug");
assert.equal(cityCode("atlantis"), "ATL", "cityCode falls back to upper slug head");

console.log("✅ cities.test.ts passed");
