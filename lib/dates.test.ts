// Script-style assertions for the shared date/countdown module (AD-039).
// Run via: `npx tsx lib/dates.test.ts`

import assert from "node:assert/strict";
import {
  addDaysIso,
  countdownCell,
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

assert.equal(countdownCell(12), "T-12");
assert.equal(countdownCell(0), "Today");
assert.equal(countdownCell(-3), "3d ago");
assert.equal(countdownCell(null), "—");

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
