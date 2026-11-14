// Script-style assertions for the shared date/countdown module (AD-039).
// Run via: `npx tsx lib/dates.test.ts`

import assert from "node:assert/strict";
import {
  addDaysIso,
  countdownCell,
  dayCount,
  formatDate,
  formatMonth,
  formatMonthYear,
  countdownPhrase,
  countdownTone,
  daysBetweenIso,
  daysUntilIso,
  isValidIsoDate,
  isoDateInZone,
  isoToPickerDate,
  pickerDateToIso,
} from "./dates";

// ---- isValidIsoDate ---------------------------------------------------------

assert.equal(isValidIsoDate("2027-10-27"), true);
assert.equal(isValidIsoDate("2026-7-15"), false);
// Days that do not exist are refused, not rolled into the next month.
assert.equal(isValidIsoDate("2027-02-30"), false);
assert.equal(isValidIsoDate("2027-02-31"), false);
assert.equal(isValidIsoDate("2027-02-29"), false);
assert.equal(isValidIsoDate("2028-02-29"), true);
assert.equal(isValidIsoDate("2027-13-01"), false);
assert.equal(isValidIsoDate("not-a-date"), false);
assert.equal(isValidIsoDate(null), false);
assert.equal(isValidIsoDate(undefined), false);

// ---- arithmetic -------------------------------------------------------------

assert.equal(addDaysIso("2027-10-27", -60), "2027-08-28");
assert.equal(addDaysIso("2027-10-27", 14), "2027-11-10");
assert.equal(addDaysIso("2028-04-13", 1), "2028-04-14"); // year rollover
assert.equal(daysBetweenIso("2027-10-24", "2027-10-27"), 3);
assert.equal(daysBetweenIso("2027-10-27", "2027-10-24"), -3);
assert.equal(daysBetweenIso("2027-10-27", "2027-10-27"), 0);

// ---- daysUntilIso -----------------------------------------------------------

assert.equal(daysUntilIso("2027-10-27", "2027-10-24"), 3); // T-3
assert.equal(daysUntilIso("2027-10-27", "2027-10-27"), 0); // move day
assert.equal(daysUntilIso("2027-10-27", "2027-10-28"), -1); // T+1
assert.equal(daysUntilIso("2027-10-27", "2027-11-26"), -30); // T+30
assert.equal(daysUntilIso(null, "2027-10-24"), null);
assert.equal(daysUntilIso("garbage", "2027-10-24"), null);

// ---- countdownTone ----------------------------------------------------------

assert.equal(countdownTone(null), "default");
assert.equal(countdownTone(90), "default");
assert.equal(countdownTone(60), "warn");
assert.equal(countdownTone(14), "danger");
assert.equal(countdownTone(0), "warn"); // moving today
assert.equal(countdownTone(-1), "ok"); // moved — never red after the fact

// ---- countdownPhrase (the post-move fix: never "T-MINUS +3d") ---------------

assert.deepEqual(countdownPhrase(3), { lead: "Moving in", count: 3, trail: "days" });
assert.deepEqual(countdownPhrase(1), { lead: "Moving in", count: 1, trail: "day" });
assert.deepEqual(countdownPhrase(0), { lead: "Moving", count: null, trail: "today" });
assert.deepEqual(countdownPhrase(-1), { lead: "Moved", count: 1, trail: "day ago" });
assert.deepEqual(countdownPhrase(-3), { lead: "Moved", count: 3, trail: "days ago" });
assert.deepEqual(countdownPhrase(null), {
  lead: "Set your move date",
  count: null,
  trail: "",
});

// ---- countdownCell (compact tile variant) -----------------------------------

assert.equal(countdownCell(12), "12 days");
assert.equal(countdownCell(1), "1 day");
assert.equal(countdownCell(0), "Today");
assert.equal(countdownCell(-3), "3 days ago");
assert.equal(countdownCell(-1), "1 day ago");
assert.equal(countdownCell(null), "Not set");
assert.equal(dayCount(1), "1 day");
assert.equal(dayCount(-45), "45 days");

// ---- dates on screen -----------------------------------------------------------
// The same words in every zone the tests run in, and never the stored form.

assert.equal(formatDate("2026-09-28"), "Sep 28, 2026");
assert.equal(formatDate("2026-01-01"), "Jan 1, 2026");
assert.equal(formatDate("2026-12-31T23:30:00.000Z"), "Dec 31, 2026");
assert.equal(formatDate("soon"), "soon");
assert.equal(formatMonth("2026-04"), "Apr");
assert.equal(formatMonth("2026-12"), "Dec");
assert.equal(formatMonthYear("2026-07-13"), "Jul 2026");
assert.equal(formatMonthYear("2025-01-01"), "Jan 2025");

// ---- the date picker bridge ----------------------------------------------------
// react-day-picker highlights and returns local-midnight dates. Whatever zone
// this runs in (`pnpm test` uses UTC and America/Los_Angeles), the day shown
// must be the day saved.
{
  const shown = isoToPickerDate("2026-10-01");
  assert.deepEqual(
    [shown.getFullYear(), shown.getMonth() + 1, shown.getDate(), shown.getHours()],
    [2026, 10, 1, 0],
    "an ISO date opens the calendar on that local day, at local midnight",
  );
  // What the picker hands back for a click on Sep 30: local midnight.
  assert.equal(pickerDateToIso(new Date(2026, 8, 30)), "2026-09-30", "a clicked day is saved as that day");
  assert.equal(pickerDateToIso(new Date(2026, 8, 30, 23, 59)), "2026-09-30", "late in the local day too");
  for (const iso of ["2026-01-01", "2026-03-08", "2026-11-01", "2028-02-29", "2026-12-31"]) {
    assert.equal(pickerDateToIso(isoToPickerDate(iso)), iso, `round trip ${iso}`);
  }
}

// ---- isoDateInZone ----------------------------------------------------------
{
  const evening = new Date("2027-10-25T01:00:00Z");
  assert.equal(isoDateInZone(evening, "America/Los_Angeles"), "2027-10-24");
  assert.equal(isoDateInZone(evening, "America/Denver"), "2027-10-24");
  assert.equal(isoDateInZone(evening, "UTC"), "2027-10-25");
  assert.equal(isoDateInZone(evening, "Europe/Madrid"), "2027-10-25");
}

console.log("lib/dates.test.ts — all assertions passed");
