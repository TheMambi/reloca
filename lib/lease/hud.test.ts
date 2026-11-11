// Script-style assertions for the HUD FMR helpers via __internals — the test
// that export was created for and never got (Wave 6, AD-044). No live calls.
// Run via: `npx tsx lib/lease/hud.test.ts`

import assert from "node:assert/strict";
import { __internals } from "./hud";

const { ZIP_TO_ENTITY, bedToKey, coerceMoney, coerceYear } = __internals;

// bedToKey: integer 0–4 maps to the HUD column names; everything else null.
assert.equal(bedToKey(0), "Efficiency");
assert.equal(bedToKey(2), "Two-Bedroom");
assert.equal(bedToKey(4), "Four-Bedroom");
assert.equal(bedToKey(5), null);
assert.equal(bedToKey(-1), null);
assert.equal(bedToKey(2.5), null);

// coerceMoney: numbers pass through; "$3,080" style strings clean up; junk → null.
assert.equal(coerceMoney(3080), 3080);
assert.equal(coerceMoney("$3,080"), 3080);
assert.equal(coerceMoney(" 2 903 "), 2903);
assert.equal(coerceMoney(""), null);
assert.equal(coerceMoney("n/a"), null);
assert.equal(coerceMoney(undefined), null);

// coerceYear: 4-digit strings + integers only.
assert.equal(coerceYear(2026), 2026);
assert.equal(coerceYear("2026"), 2026);
assert.equal(coerceYear("26"), null);
assert.equal(coerceYear(2026.5), null);
assert.equal(coerceYear(null), null);

// ZIP map: every entry targets a HUD metro entity id (documented limitation:
// only the Long Beach zips the user has saved — unknown zips degrade to null).
for (const [zip, entity] of Object.entries(ZIP_TO_ENTITY)) {
  assert.match(zip, /^\d{5}$/);
  assert.match(entity, /^METRO/);
}

console.log("hud.test.ts ✅");
