// Script-style assertions for the freshness helpers (AD-041).
// Run via: `npx tsx lib/data/staleness.test.ts`

import assert from "node:assert/strict";
import {
  ageInDays,
  isStale,
  sourceStaleThreshold,
  STALE_AFTER_DAYS,
} from "./staleness";

const TODAY = "2026-07-12";

// ---- ageInDays across the formats that appear in the data files -------------

assert.equal(ageInDays("2026-07-12", TODAY), 0);
assert.equal(ageInDays("2026-07-10", TODAY), 2);
assert.equal(ageInDays("2026-05-30", TODAY), 43); // the AirNow snapshot case
assert.equal(ageInDays("2026-05", TODAY), 72); // month-grain → 1st of month
assert.equal(ageInDays("2026-05-30 15:00 PST", TODAY), 43); // AirNow observedAt
assert.equal(ageInDays("2026-05-30T15:00:00+00:00", TODAY), 43); // ISO datetime
assert.equal(ageInDays(null, TODAY), null);
assert.equal(ageInDays("garbage", TODAY), null);
// Future stamps clamp to 0, never negative.
assert.equal(ageInDays("2026-08-01", TODAY), 0);

// ---- isStale -----------------------------------------------------------------

assert.equal(isStale("2026-07-11", STALE_AFTER_DAYS.airQuality, TODAY), false);
assert.equal(isStale("2026-05-30", STALE_AFTER_DAYS.airQuality, TODAY), true);
assert.equal(isStale("2025-04-01", STALE_AFTER_DAYS.liveAnnual, TODAY), true);
assert.equal(isStale("2026-05-30", STALE_AFTER_DAYS.liveAnnual, TODAY), false);
assert.equal(isStale(null, STALE_AFTER_DAYS.airQuality, TODAY), false); // unknown ≠ stale
assert.equal(isStale("2020-01-01", STALE_AFTER_DAYS.modeled, TODAY), false); // modeled never

// ---- sourceStaleThreshold ------------------------------------------------------

assert.equal(
  sourceStaleThreshold({ id: "air-quality-airnow-2026", tier: "live" }),
  STALE_AFTER_DAYS.airQuality,
);
assert.equal(
  sourceStaleThreshold({ id: "rent-hud-fmr-2026", tier: "live" }),
  STALE_AFTER_DAYS.liveAnnual,
);
assert.equal(
  sourceStaleThreshold({ id: "crime-sac-2024", tier: "modeled" }),
  STALE_AFTER_DAYS.modeled,
);

console.log("staleness.test.ts ✅");
