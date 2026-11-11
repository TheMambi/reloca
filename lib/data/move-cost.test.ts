// Script-style assertions for the moving-cost helpers + the Wave 1 (AD-039)
// action-input gate. Run via: `npx tsx lib/data/move-cost.test.ts`
//
// The patch schema is the regression net for the jsonb-bricking bug: a
// malformed `scenarios` payload written raw to the jsonb column would make
// every subsequent Zod-parsed read throw, 500-ing /moving-cost + the dashboard.

import assert from "node:assert/strict";
import {
  MoveEstimatePatchSchema,
  LineItemSchema,
  ScenarioSchema,
} from "@/schemas/move-cost";
import {
  recomputeScenarioTotals,
  buildDefaultScenarios,
} from "./move-cost-db";

// ---- recomputeScenarioTotals -------------------------------------------------

{
  const scenarios = buildDefaultScenarios();
  assert.equal(scenarios.length, 3, "3 default scenarios");
  assert.ok(scenarios.every((s) => s.total === 0), "defaults start at $0");

  const edited = scenarios.map((s, i) =>
    i === 0
      ? { ...s, line_items: s.line_items.map((li) => ({ ...li, cost: 100 })) }
      : s,
  );
  const recomputed = recomputeScenarioTotals(edited);
  assert.equal(
    recomputed[0].total,
    edited[0].line_items.length * 100,
    "total = sum of line items",
  );
  assert.equal(recomputed[1].total, 0, "untouched scenario stays 0");
}

// ---- valid patches parse -------------------------------------------------------

{
  const ok = MoveEstimatePatchSchema.safeParse({
    distance_miles: 1346,
    scenarios: buildDefaultScenarios(),
  });
  assert.ok(ok.success, "valid patch parses");

  const partial = MoveEstimatePatchSchema.safeParse({ move_date: null });
  assert.ok(partial.success, "explicit-null date allowed");
  assert.ok(
    partial.success && "move_date" in partial.data,
    "explicit null survives parsing (merge semantics)",
  );
  assert.ok(
    partial.success && !("distance_miles" in partial.data),
    "absent keys stay absent (merge semantics)",
  );
}

// ---- malformed payloads reject (the bricking cases) ---------------------------

{
  // Negative cost.
  const negative = MoveEstimatePatchSchema.safeParse({
    scenarios: [
      {
        id: "diy",
        kind: "diy",
        label: "DIY",
        line_items: [{ id: "x", name: "Truck", cost: -50 }],
        total: -50,
      },
    ],
  });
  assert.equal(negative.success, false, "negative cost rejected");

  // Missing required scenario fields.
  const missing = MoveEstimatePatchSchema.safeParse({
    scenarios: [{ id: "diy", label: "DIY" }],
  });
  assert.equal(missing.success, false, "incomplete scenario rejected");

  // Wrong types entirely.
  const wrong = MoveEstimatePatchSchema.safeParse({ scenarios: "not-an-array" });
  assert.equal(wrong.success, false, "non-array scenarios rejected");

  // Smuggled extra keys (strict schema).
  const smuggled = MoveEstimatePatchSchema.safeParse({
    distance_miles: 10,
    user_id: "someone-else",
  });
  assert.equal(smuggled.success, false, "extra keys rejected by .strict()");

  // Bad date format.
  const badDate = MoveEstimatePatchSchema.safeParse({ move_date: "09/30/2026" });
  assert.equal(badDate.success, false, "non-ISO date rejected");
}

// ---- line-item + scenario schemas round-trip ----------------------------------

{
  const li = LineItemSchema.safeParse({ id: "a", name: "Fuel", cost: 120.5 });
  assert.ok(li.success, "valid line item parses");

  const badLi = LineItemSchema.safeParse({ id: "", name: "Fuel", cost: 1 });
  assert.equal(badLi.success, false, "empty id rejected");

  const scenario = ScenarioSchema.safeParse(buildDefaultScenarios()[0]);
  assert.ok(scenario.success, "default scenario round-trips");
}

console.log("move-cost.test.ts ✅");
