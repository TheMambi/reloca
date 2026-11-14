// Drag announcements must name tasks and groups, never ids.
// Run: npx tsx lib/checklist/announcements.test.ts

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { dragAnnouncements } from "./announcements";
import { containerId } from "./reorder";
import type { ChecklistCategory, ChecklistItem } from "@/schemas";

function row(category: ChecklistCategory, title: string): ChecklistItem {
  return {
    id: randomUUID(),
    user_id: randomUUID(),
    category,
    title,
    description: null,
    due_date: null,
    completed: false,
    completed_at: null,
    order_index: 0,
    created_at: "2026-05-30T00:00:00+00:00",
    updated_at: "2026-05-30T00:00:00+00:00",
  };
}

const labels: Record<ChecklistCategory, string> = {
  lease: "Lease & Move-Out",
  "pre-move": "Pre-Move",
  "move-week": "Move Week",
  "post-move": "Post-Move",
};
const quotes = row("pre-move", "Get three moving quotes");
const boxes = row("move-week", "Order boxes");
const say = dragAnnouncements([quotes, boxes], labels);

const spoken = [
  say.start(quotes.id),
  say.over(quotes.id, boxes.id),
  say.over(quotes.id, containerId("post-move")),
  say.over(quotes.id, quotes.id),
  say.over(quotes.id, null),
  say.end(quotes.id, boxes.id),
  say.end(quotes.id, containerId("post-move")),
  say.end(quotes.id, null),
  say.cancel(quotes.id),
  // A task that has just been deleted elsewhere still gets words.
  say.start(randomUUID()),
  say.end(quotes.id, randomUUID()),
];

assert.equal(spoken[0], 'Picked up "Get three moving quotes".');
assert.equal(spoken[1], '"Get three moving quotes" is over "Order boxes" in Move Week.');
assert.equal(spoken[2], '"Get three moving quotes" is over the Post-Move group.');
assert.equal(spoken[5], '"Get three moving quotes" was dropped at "Order boxes" in Move Week.');
assert.equal(spoken[7], '"Get three moving quotes" was put back where it was.');

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
for (const line of spoken) {
  assert.ok(!UUID.test(line), `an id reached the announcement: ${line}`);
  assert.ok(!line.includes("container:"), `a container id reached the announcement: ${line}`);
}

console.log("lib/checklist/announcements.test.ts: all assertions passed");
