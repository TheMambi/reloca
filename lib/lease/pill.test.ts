// Script-style assertions for the deadline-pill calculator (Wave 6, AD-044).
// Run via: `npx tsx lib/lease/pill.test.ts`

import assert from "node:assert/strict";
import { computeDeadlinePill, computeTMinus } from "./pill";

// Renew short-circuits everything.
assert.deepEqual(computeDeadlinePill(3, false, null, "renew"), {
  label: "LEASE · RENEWED",
  tone: "info",
});

// Notice sent wins over any countdown.
assert.deepEqual(computeDeadlinePill(-10, true, "2027-08-24", "vacate"), {
  label: "NOTICE SENT · AUG 24",
  tone: "ok",
});

// Threshold ladder.
assert.deepEqual(computeDeadlinePill(null, false, null, "undecided"), {
  label: "—",
  tone: "info",
});
assert.equal(computeDeadlinePill(2, false, null, "undecided").label, "CRITICAL");
assert.equal(computeDeadlinePill(2, false, null, "undecided").tone, "danger");
assert.equal(computeDeadlinePill(7, false, null, "undecided").label, "URGENT");
assert.equal(computeDeadlinePill(7, false, null, "undecided").tone, "coral");
assert.equal(computeDeadlinePill(14, false, null, "undecided").label, "ATTENTION");
assert.equal(computeDeadlinePill(14, false, null, "undecided").tone, "warn");
assert.equal(computeDeadlinePill(15, false, null, "undecided").label, "ON TRACK");
assert.equal(computeDeadlinePill(15, false, null, "undecided").tone, "info");

// Past-due without a sent notice stays critical (days ≤ 2 branch).
assert.equal(computeDeadlinePill(-3, false, null, "vacate").tone, "danger");

// T-MINUS headline: a sent notice replaces the countdown.
assert.deepEqual(computeTMinus(-16, false, "2028-01-31", "2028-02-03"), { headline: "Sent", sub: "ON TIME" });
assert.deepEqual(computeTMinus(-16, false, "2028-02-03", "2028-02-03"), { headline: "Sent", sub: "ON TIME" });
assert.deepEqual(computeTMinus(-16, false, "2028-02-05", "2028-02-03"), { headline: "Sent", sub: "2 DAYS LATE" });
assert.deepEqual(computeTMinus(-16, false, "2028-02-04", "2028-02-03"), { headline: "Sent", sub: "1 DAY LATE" });
assert.deepEqual(computeTMinus(null, false, "2028-02-04", null), { headline: "Sent", sub: "" });
// Without a sent notice the countdown behaves as before.
assert.deepEqual(computeTMinus(11, false, null, "2028-02-03"), { headline: "11d", sub: "11 DAYS" });
assert.deepEqual(computeTMinus(1, false, null, "2028-02-03"), { headline: "1d", sub: "1 DAY" });
assert.deepEqual(computeTMinus(0, false, null, "2028-02-03"), { headline: "0d", sub: "TODAY" });
assert.deepEqual(computeTMinus(-3, false, null, "2028-02-03"), { headline: "Overdue", sub: "3 DAYS PAST" });
assert.deepEqual(computeTMinus(null, false, null, null), { headline: "—", sub: "" });
// Moved out wins over everything.
assert.deepEqual(computeTMinus(-40, true, "2028-01-31", "2028-02-03"), { headline: "Done", sub: "MOVED OUT" });

console.log("pill.test.ts ✅");
