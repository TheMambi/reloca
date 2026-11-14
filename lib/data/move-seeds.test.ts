// Script-style assertions for the pure move-seed helpers.
// Run via: `npx tsx lib/data/move-seeds.test.ts`

import assert from "node:assert/strict";
import { fillSeedText, seededDueDate, shiftedDueDates } from "./move-seeds";
import { getChecklistSeed } from "./checklist";

// City names come from the relocation, never from the template.
const names = { originName: "Sacramento", destinationName: "Denver" };
assert.equal(fillSeedText("Pack + clean {origin} apartment", names), "Pack + clean Sacramento apartment");
assert.equal(fillSeedText("{origin} → {destination}, then {destination}", names), "Sacramento → Denver, then Denver");
for (const item of getChecklistSeed()) {
  const text = `${item.title} ${item.description ?? ""}`;
  assert.doesNotMatch(text, /Denver|Long Beach|\bCO\b|\bCA\b/, `seed text names no city or state: ${item.title}`);
  assert.doesNotMatch(fillSeedText(text, names), /[{}]/, `every placeholder is known: ${item.title}`);
}

assert.equal(seededDueDate("2026-12-28", -1), "2026-12-27");
assert.equal(seededDueDate(null, -1), null);

const rows = [
  { id: "move-day", due_date: "2026-12-28", offset: 0 },
  { id: "day-before", due_date: "2026-12-27", offset: -1 },
  { id: "re-dated-by-hand", due_date: "2026-12-20", offset: -1 },
  { id: "own-task", due_date: "2026-12-28", offset: null },
  { id: "no-date", due_date: null, offset: 10 },
];
const offsetOf = (row: (typeof rows)[number]) => row.offset;

// The move slips 30 days: rows on their seeded date follow, the rest stay.
assert.deepEqual(shiftedDueDates(rows, offsetOf, "2026-12-28", "2027-01-27"), [
  { id: "move-day", due_date: "2027-01-27" },
  { id: "day-before", due_date: "2027-01-26" },
]);
// Same date: nothing to do.
assert.deepEqual(shiftedDueDates(rows, offsetOf, "2026-12-28", "2026-12-28"), []);
// The date is cleared: seeded rows lose theirs, so a later date can set them again.
assert.deepEqual(shiftedDueDates(rows, offsetOf, "2026-12-28", null), [
  { id: "move-day", due_date: null },
  { id: "day-before", due_date: null },
]);
// A first date is set: rows seeded without one get theirs.
assert.deepEqual(shiftedDueDates(rows, offsetOf, null, "2027-01-27"), [
  { id: "no-date", due_date: "2027-02-06" },
]);

console.log("move-seeds.test.ts ✅");
