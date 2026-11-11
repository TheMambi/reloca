// Script-style assertions for the haversine helper (Wave 6, AD-044).
// Run via: `npx tsx lib/lease/distance.test.ts`

import assert from "node:assert/strict";
import { haversineMiles } from "./distance";

const DENVER = { lat: 39.7392, lng: -104.9903 };
const LONG_BEACH = { lat: 33.7701, lng: -118.1937 };
const SACRAMENTO = { lat: 38.5816, lng: -121.4944 };

// Zero distance to itself.
assert.equal(haversineMiles(DENVER, DENVER), 0);

// Symmetry.
const dl = haversineMiles(DENVER, LONG_BEACH);
assert.equal(dl, haversineMiles(LONG_BEACH, DENVER));

// Known great-circle distances (±2% tolerance): DEN↔LGB ≈ 830 mi,
// DEN↔SAC ≈ 887 mi. Locks the radius/unit convention (miles, not km).
function within(actual: number, expected: number, pct: number) {
  assert.ok(
    Math.abs(actual - expected) / expected <= pct,
    `${actual} not within ${pct * 100}% of ${expected}`,
  );
}
within(dl, 830, 0.02);
within(haversineMiles(DENVER, SACRAMENTO), 887, 0.02);

console.log("distance.test.ts ✅");
