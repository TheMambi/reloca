// Relocation compare aggregator (Phase 8 Wave C, C.5).
// Run via: `npx tsx lib/data/relocation-compare.test.ts`
//
// Proves each relocation reduces to its destination-city reference facts across
// every domain (cost / crime / climate / air / walkability / community), that
// the active move sorts first, and that values actually resolve for all three
// cities (so a Sacramento what-if compares against the Long Beach move).

import assert from "node:assert/strict";
import { buildRelocationCompareColumns } from "./relocation-compare";
import type { Relocation } from "@/schemas";

function reloc(over: Partial<Relocation>): Relocation {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    user_id: "11111111-1111-1111-1111-111111111111",
    label: "Test move",
    origin_slug: "denver",
    destination_slug: "long-beach",
    move_date: null,
    is_active_move: false,
    created_at: "2026-05-30T00:00:00+00:00",
    updated_at: "2026-05-30T00:00:00+00:00",
    ...over,
  };
}

const sac = reloc({
  id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  label: "Sacramento what-if",
  destination_slug: "sacramento",
  created_at: "2026-05-31T00:00:00+00:00",
});
const lb = reloc({
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  label: "Long Beach move",
  destination_slug: "long-beach",
  is_active_move: true,
  created_at: "2026-05-30T00:00:00+00:00",
});

// Pass them sac-first to prove the active-move sort, not input order.
const cols = buildRelocationCompareColumns([sac, lb]);

assert.equal(cols.length, 2, "one column per relocation");
assert.equal(cols[0].id, lb.id, "active move sorts first");
assert.equal(cols[0].destinationCode, "LGB");
assert.equal(cols[1].destinationCode, "SAC");

// Every domain resolves for both destinations (no all-dashes column).
for (const c of cols) {
  assert.ok(c.costMonthly && c.costMonthly > 0, `${c.label}: cost resolves`);
  assert.ok(c.costVsOriginPct !== null, `${c.label}: cost-vs-origin resolves`);
  assert.ok(c.violentPer1k !== null, `${c.label}: crime resolves`);
  assert.ok(c.floodTier, `${c.label}: flood tier resolves`);
  assert.ok(c.heatDays !== null, `${c.label}: heat days resolves`);
  assert.ok(c.aqi !== null, `${c.label}: air quality resolves`);
  assert.ok(c.aqiCategory, `${c.label}: air quality rating resolves`);
  assert.ok(c.walkScore !== null, `${c.label}: walk score resolves`);
  assert.ok(c.walkCategory, `${c.label}: walk rating resolves`);
  assert.ok(c.rent2br && c.rent2br > 0, `${c.label}: 2-bed rent resolves`);
  assert.ok(c.vibeCount !== null, `${c.label}: vibe count resolves`);
}

// The active column is flagged so the table can coral-border it.
assert.equal(cols[0].isActive, true);
assert.equal(cols[1].isActive, false);

console.log("✅ relocation-compare.test.ts passed");
