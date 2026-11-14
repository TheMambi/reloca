// Script-style assertions for the pure parts of the destination overlays.
// Run via: `npx tsx --conditions=react-server lib/lease/overlays.test.ts`

import assert from "node:assert/strict";
import { extractZip, hudEntityForCity, overlayPatch } from "./overlays";

// extractZip: a zip follows a state code or ends the text. A house number does neither.
assert.equal(extractZip("12345 Ventura Blvd Long Beach"), null, "house number is not a zip");
assert.equal(extractZip("100 Sample Street Long Beach, CA 90802"), "90802");
assert.equal(extractZip("100 Sample Street Long Beach CA 90802-1234"), "90802");
assert.equal(extractZip("12345 Ventura Blvd Long Beach 90802"), "90802", "zip at the end wins over the house number");
assert.equal(extractZip("12345"), null, "a lone number is not an address with a zip");
assert.equal(extractZip(""), null);
assert.equal(extractZip(null), null);

// hudEntityForCity: every registry city resolves, not only five Long Beach zips.
assert.equal(hudEntityForCity("Sacramento", "CA"), "METRO40900M40900");
assert.equal(hudEntityForCity("Denver", null), "METRO19740M19740");
assert.equal(hudEntityForCity(" long beach ", "CA"), "METRO31080MM4480");
assert.equal(hudEntityForCity("Long Beach, CA", null), "METRO31080MM4480");
assert.equal(hudEntityForCity("Long Beach", "NY"), null, "same name in another state is another metro");
assert.equal(hudEntityForCity("Testville", "CA"), null);
assert.equal(hudEntityForCity(null, null), null);

// overlayPatch: a failed or skipped lookup never erases stored values.
const nothing = { fmr: { value: null, year: null }, geo: null };
const found = { fmr: { value: 2100, year: 2026 }, geo: { lat: 38.58, lng: -121.49 } };
assert.deepEqual(
  overlayPatch(nothing, { addressChanged: false, skipCoordinates: false }),
  {},
  "same address, lookups failed: nothing is written, stored coordinates survive",
);
assert.deepEqual(
  overlayPatch(nothing, { addressChanged: true, skipCoordinates: false }),
  { hud_fmr_2br: null, hud_fmr_year: null, lat: null, lng: null },
  "new address, lookups failed: the old place's values are cleared",
);
assert.deepEqual(
  overlayPatch(found, { addressChanged: false, skipCoordinates: false }),
  { hud_fmr_2br: 2100, hud_fmr_year: 2026, lat: 38.58, lng: -121.49 },
  "a value that was found is written",
);
assert.deepEqual(
  overlayPatch(found, { addressChanged: true, skipCoordinates: true }),
  { hud_fmr_2br: 2100, hud_fmr_year: 2026 },
  "the demo never writes coordinates",
);

console.log("overlays.test.ts ✅");
