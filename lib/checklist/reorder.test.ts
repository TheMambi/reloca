// Pure reorder index-math tests (Wave E.2).
// Run: npx tsx lib/checklist/reorder.test.ts
//
// Covers the (active, over) → renumbered-list + moved-target computation:
// same-category move up/down, cross-category move, drop on an empty container,
// no-op when nothing changes, and the lease-row guard.

import assert from "node:assert/strict";
import { reorderItems, containerId } from "./reorder";
import type { ChecklistItem, ChecklistCategory } from "@/schemas";

function row(
  id: string,
  category: ChecklistCategory,
  order_index: number,
): ChecklistItem {
  return {
    id,
    user_id: "11111111-1111-1111-1111-111111111111",
    category,
    title: `Task ${id}`,
    description: null,
    due_date: null,
    completed: false,
    completed_at: null,
    order_index,
    created_at: "2026-05-30T00:00:00+00:00",
    updated_at: "2026-05-30T00:00:00+00:00",
  };
}

// pre-move: a,b,c,d  ·  move-week: x,y  ·  lease: L0
function fixture(): ChecklistItem[] {
  return [
    row("a", "pre-move", 0),
    row("b", "pre-move", 1),
    row("c", "pre-move", 2),
    row("d", "pre-move", 3),
    row("x", "move-week", 0),
    row("y", "move-week", 1),
    row("L0", "lease", 0),
  ];
}

function orderOf(items: ChecklistItem[], cat: ChecklistCategory): string[] {
  return items
    .filter((i) => i.category === cat)
    .sort((p, q) => p.order_index - q.order_index)
    .map((i) => i.id);
}

function assertDense(items: ChecklistItem[], cat: ChecklistCategory) {
  const idxs = items
    .filter((i) => i.category === cat)
    .map((i) => i.order_index)
    .sort((p, q) => p - q);
  assert.deepEqual(
    idxs,
    idxs.map((_, i) => i),
    `${cat} should be dense [0,N)`,
  );
}

// ── Move down: drop "a" (idx 0) onto "c" (idx 2) ───────────────────────
{
  const r = reorderItems(fixture(), "a", "c");
  assert.ok(r, "move-down returns a result");
  assert.equal(r!.moved.category, "pre-move");
  assert.equal(r!.moved.order_index, 2, "a lands at index 2");
  assert.deepEqual(orderOf(r!.items, "pre-move"), ["b", "c", "a", "d"]);
  assertDense(r!.items, "pre-move");
}

// ── Move up: drop "d" (idx 3) onto "b" (idx 1) ─────────────────────────
{
  const r = reorderItems(fixture(), "d", "b");
  assert.ok(r, "move-up returns a result");
  assert.equal(r!.moved.order_index, 1, "d lands at index 1");
  assert.deepEqual(orderOf(r!.items, "pre-move"), ["a", "d", "b", "c"]);
  assertDense(r!.items, "pre-move");
}

// ── Cross-category: drop "a" (pre-move) onto "y" (move-week idx 1) ──────
{
  const r = reorderItems(fixture(), "a", "y");
  assert.ok(r, "cross-category returns a result");
  assert.equal(r!.moved.category, "move-week");
  assert.equal(r!.moved.order_index, 1, "a lands where y was");
  assert.deepEqual(orderOf(r!.items, "move-week"), ["x", "a", "y"]);
  assert.deepEqual(orderOf(r!.items, "pre-move"), ["b", "c", "d"]);
  assertDense(r!.items, "move-week");
  assertDense(r!.items, "pre-move");
}

// ── Drop on an empty/explicit container: append to that category ───────
{
  const r = reorderItems(fixture(), "a", containerId("move-week"));
  assert.ok(r, "container drop returns a result");
  assert.equal(r!.moved.category, "move-week");
  assert.equal(r!.moved.order_index, 2, "a appends after x,y");
  assert.deepEqual(orderOf(r!.items, "move-week"), ["x", "y", "a"]);
}

// ── No-op: drop a row on itself ────────────────────────────────────────
assert.equal(reorderItems(fixture(), "a", "a"), null, "self-drop is a no-op");

// ── No-op: drop a row where it already is (onto its current neighbour
//    position that resolves to the same index) ──────────────────────────
{
  // Dropping "a" (idx 0) onto "a" — covered above; dropping b onto b:
  assert.equal(reorderItems(fixture(), "b", "b"), null, "same-spot no-op");
}

// ── Lease guard: lease rows never reorder, and nothing drops into lease ─
assert.equal(reorderItems(fixture(), "L0", "a"), null, "lease row can't be dragged");
assert.equal(
  reorderItems(fixture(), "a", "L0"),
  null,
  "can't drop onto a lease row",
);
assert.equal(
  reorderItems(fixture(), "a", containerId("lease")),
  null,
  "can't drop into the lease container",
);

console.log("✅ reorder.test.ts passed");
