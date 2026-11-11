// Script-style assertions for `computeReadiness`.
// Run via: `npx tsx lib/data/move-readiness.test.ts`
//
// Mirrors lib/lease/forecast.test.ts — self-contained node script that exits
// non-zero on assertion failure. Tests the pure aggregator only — does NOT
// hit Supabase.

import assert from "node:assert/strict";
import { computeReadiness } from "./move-readiness";
import type { ChecklistItem } from "@/schemas";
import type {
  UtilityTransition,
  AddressChangeTarget,
} from "@/schemas/transitions";

// ── Fixtures ───────────────────────────────────────────────────────────

function checklistItem(
  partial: Partial<ChecklistItem> & {
    category: ChecklistItem["category"];
    completed: boolean;
  },
): ChecklistItem {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    user_id: "00000000-0000-0000-0000-000000000000",
    title: "test",
    description: null,
    due_date: null,
    completed_at: null,
    order_index: 0,
    created_at: "2026-05-01T00:00:00.000+00:00",
    updated_at: "2026-05-01T00:00:00.000+00:00",
    ...partial,
  };
}

function utility(
  status: UtilityTransition["status"],
): UtilityTransition {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    user_id: "00000000-0000-0000-0000-000000000000",
    kind: "electricity",
    side: "origin",
    custom_label: null,
    provider: null,
    account_number: null,
    login_url: null,
    phone: null,
    notes: null,
    scheduled_date: null,
    status,
    confirmed_at: null,
    order_index: 0,
    created_at: "2026-05-01T00:00:00.000+00:00",
    updated_at: "2026-05-01T00:00:00.000+00:00",
  };
}

function address(
  status: AddressChangeTarget["status"],
): AddressChangeTarget {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    user_id: "00000000-0000-0000-0000-000000000000",
    kind: "bank",
    name: "test",
    due_date: null,
    channel: null,
    reference_number: null,
    status,
    submitted_at: null,
    confirmed_at: null,
    notes: null,
    order_index: 0,
    created_at: "2026-05-01T00:00:00.000+00:00",
    updated_at: "2026-05-01T00:00:00.000+00:00",
  };
}

// ── Fixture 1: empty across the board ─────────────────────────────────

{
  const r = computeReadiness([], [], [], {
    walkthroughStarted: false,
    pdfGenerated: false,
  });
  assert.equal(r.total, 0, "empty: total");
  assert.equal(r.completed, 0, "empty: completed");
  assert.equal(r.byCategory.checklist.total, 0);
  assert.equal(r.byCategory.lease.total, 0);
  assert.equal(r.byCategory.utility.total, 0);
  assert.equal(r.byCategory.address.total, 0);
  assert.equal(r.byCategory.deposit.walkthroughStarted, false);
}

// ── Fixture 2: mixed ──────────────────────────────────────────────────
//
// 5 non-lease checklist items, 3 done.
// 7 lease items, all done.
// 4 utility rows: 2 confirmed, 1 needs_action, 1 skipped (excluded).
// 3 address rows: 1 confirmed, 1 submitted (NOT counted as completed —
//   only `confirmed` rolls into "completed" since submitted is mid-flight),
//   1 needs_action.
// Deposit: walkthrough started but no PDF yet.

{
  const checklist: ChecklistItem[] = [
    checklistItem({ category: "pre-move", completed: true }),
    checklistItem({ category: "pre-move", completed: true }),
    checklistItem({ category: "move-week", completed: true }),
    checklistItem({ category: "move-week", completed: false }),
    checklistItem({ category: "post-move", completed: false }),
    checklistItem({ category: "lease", completed: true }),
    checklistItem({ category: "lease", completed: true }),
    checklistItem({ category: "lease", completed: true }),
    checklistItem({ category: "lease", completed: true }),
    checklistItem({ category: "lease", completed: true }),
    checklistItem({ category: "lease", completed: true }),
    checklistItem({ category: "lease", completed: true }),
  ];

  const utilities: UtilityTransition[] = [
    utility("confirmed"),
    utility("confirmed"),
    utility("needs_action"),
    utility("skipped"),
  ];

  const targets: AddressChangeTarget[] = [
    address("confirmed"),
    address("submitted"),
    address("needs_action"),
  ];

  const r = computeReadiness(checklist, utilities, targets, {
    walkthroughStarted: true,
    pdfGenerated: false,
  });

  // Per-category math
  assert.equal(r.byCategory.checklist.total, 5, "mixed: checklist total");
  assert.equal(r.byCategory.checklist.completed, 3, "mixed: checklist completed");
  assert.equal(r.byCategory.lease.total, 7, "mixed: lease total");
  assert.equal(r.byCategory.lease.completed, 7, "mixed: lease completed");
  assert.equal(r.byCategory.utility.total, 3, "mixed: utility total (skipped excluded)");
  assert.equal(r.byCategory.utility.completed, 2, "mixed: utility completed");
  assert.equal(r.byCategory.address.total, 3, "mixed: address total");
  assert.equal(
    r.byCategory.address.completed,
    1,
    "mixed: address completed (submitted ≠ completed)",
  );
  assert.equal(r.byCategory.deposit.walkthroughStarted, true);

  // Roll-up: 5 + 7 + 3 + 3 + 1(walkthrough) = 19 total; 3 + 7 + 2 + 1 + 0(no pdf) = 13 completed
  assert.equal(r.total, 19, "mixed: total roll-up");
  assert.equal(r.completed, 13, "mixed: completed roll-up");
}

// ── Fixture 3: deposit pdf landed ─────────────────────────────────────

{
  const r = computeReadiness([], [], [], {
    walkthroughStarted: true,
    pdfGenerated: true,
  });
  // walkthroughStarted bumps total by 1, pdfGenerated bumps completed by 1.
  assert.equal(r.total, 1);
  assert.equal(r.completed, 1);
}

console.log("✅ move-readiness.test.ts passed");
