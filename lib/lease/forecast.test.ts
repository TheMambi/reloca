// Script-style assertions for `computeForecast` + `monthsBetween`.
// Run via: `npx tsx lib/lease/forecast.test.ts`
//
// We don't have Vitest/Jest in this project; this file is a self-contained
// node script that exits non-zero on assertion failure.

import assert from "node:assert/strict";
import { computeForecast, monthsBetween, type ForecastInput } from "./forecast";

// Fictional fixture numbers.
const input: ForecastInput = {
  current_monthly_rent: 1800,
  renewal_monthly_rent: 1750,
  m2m_premium: 400,
  lease_end_date: "2027-10-25",
  target_move_out_date: "2027-10-25",
  today: "2027-08-15",
};

const bars = computeForecast(input);

// With a renewal offer present, expect all 5 bars.
assert.equal(bars.length, 5, "expected 5 scenarios when renewal offer is set");

const byKey = Object.fromEntries(bars.map((b) => [b.key, b]));

// Stay renew: 1750 * 12 = 21000
assert.equal(byKey.stay_renew.total, 21000, "stay_renew total");
assert.equal(byKey.stay_renew.monthly, 1750, "stay_renew monthly");
assert.equal(byKey.stay_renew.color, "info", "stay_renew color");
assert.equal(
  byKey.stay_renew.label,
  "Stay (renew 12 months)",
  "stay_renew label",
);

// Vacate on time: 1800 * 2 (Aug 15 → Oct 25 is 2 full calendar months) = 3600.
// This locks the monthsBetween convention used by the chart.
assert.equal(byKey.vacate_on_time.monthly, 1800, "vacate_on_time monthly");
assert.equal(byKey.vacate_on_time.total, 3600, "vacate_on_time total");
assert.equal(byKey.vacate_on_time.color, "ok", "vacate_on_time color");
assert.equal(
  byKey.vacate_on_time.deltaVsCurrentPath,
  0,
  "vacate_on_time delta is zero (it is the reference)",
);

// M2M rate is 1800 + 400 = 2200.
assert.equal(byKey.m2m_1mo.monthly, 2200, "m2m_1mo monthly");
// 1-month-late total = vacate_on_time.total + 2200 = 5800.
assert.equal(byKey.m2m_1mo.total, 5800, "m2m_1mo total");
assert.equal(byKey.m2m_1mo.color, "warn", "m2m_1mo color");
assert.equal(
  byKey.m2m_1mo.deltaVsCurrentPath,
  2200,
  "m2m_1mo delta vs vacate-on-time",
);

// 2-month-late total = vacate_on_time.total + 4400 = 8000.
assert.equal(byKey.m2m_2mo.monthly, 2200, "m2m_2mo monthly");
assert.equal(byKey.m2m_2mo.total, 8000, "m2m_2mo total");
assert.equal(byKey.m2m_2mo.color, "warn", "m2m_2mo color");
assert.equal(
  byKey.m2m_2mo.deltaVsCurrentPath,
  4400,
  "m2m_2mo delta vs vacate-on-time",
);

// Indefinite M2M: annualized worst case = 2200 * 12 = 26400.
assert.equal(byKey.m2m_indefinite.monthly, 2200, "m2m_indefinite monthly");
assert.equal(byKey.m2m_indefinite.total, 26400, "m2m_indefinite total");
assert.equal(byKey.m2m_indefinite.color, "danger", "m2m_indefinite color");
assert.equal(byKey.m2m_indefinite.ongoing, true, "m2m_indefinite ongoing flag");
assert.equal(
  byKey.m2m_indefinite.deltaVsCurrentPath,
  22800,
  "m2m_indefinite delta vs vacate-on-time",
);

// monthsBetween basics — calendar-aware.
assert.equal(monthsBetween("2027-08-15", "2027-10-25"), 2, "Aug 15 → Oct 25");
assert.equal(monthsBetween("2027-08-15", "2027-10-15"), 2, "exact 2 months");
assert.equal(
  monthsBetween("2027-08-15", "2027-10-14"),
  1,
  "1 day short of 2 months",
);
assert.equal(monthsBetween("2027-10-25", "2027-08-15"), -3, "negative when reversed");

// Edge case: no renewal offer → stay_renew bar is omitted.
const noRenewal = computeForecast({ ...input, renewal_monthly_rent: null });
assert.equal(noRenewal.length, 4, "4 bars when no renewal offer");
assert.equal(
  noRenewal.find((b) => b.key === "stay_renew"),
  undefined,
  "stay_renew omitted",
);

// Edge case: lease already ended → monthsRemaining clamps to 0,
// so vacate_on_time.total = 0 and the M2M-late scenarios reduce to pure premium.
const ended = computeForecast({
  ...input,
  today: "2027-11-13",
  lease_end_date: "2027-10-25",
});
const endedByKey = Object.fromEntries(ended.map((b) => [b.key, b]));
assert.equal(endedByKey.vacate_on_time.total, 0, "vacate_on_time clamps to 0");
assert.equal(endedByKey.m2m_1mo.total, 2200, "m2m_1mo with 0 months remaining");
assert.equal(endedByKey.m2m_2mo.total, 4400, "m2m_2mo with 0 months remaining");
assert.equal(
  endedByKey.m2m_indefinite.total,
  26400,
  "m2m_indefinite unchanged by past lease end",
);

console.log("forecast.test.ts ✅");
