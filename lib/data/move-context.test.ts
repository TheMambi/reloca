// B.3 regression lock: the active-relocation cutover must reproduce the
// pre-cutover env date + DEN→LGB labels EXACTLY. This pins deriveMoveContext —
// the pure core behind getActiveMoveContext — against both the seeded-relocation
// path and the no-relocation fallback path.
//
// Run via: `npx tsx lib/data/move-context.test.ts`

import assert from "node:assert/strict";
import { deriveMoveContext } from "./relocation-db";
import type { Relocation } from "@/schemas";

const ENV_MOVE_DATE = "2027-10-27"; // fixture fallback move date

const seededLongBeachMove: Relocation = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  label: "Long Beach move",
  origin_slug: "denver",
  destination_slug: "long-beach",
  move_date: ENV_MOVE_DATE,
  is_active_move: true,
  created_at: "2026-09-12T00:00:00.000+00:00",
  updated_at: "2026-09-12T00:00:00.000+00:00",
};

// ── Seeded path reproduces the pre-cutover chrome exactly ──────────────

{
  const ctx = deriveMoveContext(seededLongBeachMove, ENV_MOVE_DATE);
  assert.equal(ctx.moveDate, "2027-10-27", "move date reproduces NEXT_PUBLIC_MOVE_DATE");
  assert.equal(ctx.originName, "Denver", "hero origin label");
  assert.equal(ctx.destinationName, "Long Beach", "hero destination label");
  assert.equal(ctx.originCode, "DEN", "status-row + flight-arc origin code");
  assert.equal(ctx.destinationCode, "LGB", "status-row + flight-arc destination code");
  assert.equal(ctx.originSlug, "denver");
  assert.equal(ctx.destinationSlug, "long-beach");
}

// ── No-relocation fallback renders identically (pre-seed safety) ───────

{
  const ctx = deriveMoveContext(null, ENV_MOVE_DATE);
  assert.equal(ctx.moveDate, "2027-10-27", "fallback move date = env");
  assert.equal(ctx.originName, "Denver");
  assert.equal(ctx.destinationName, "Long Beach");
  assert.equal(ctx.originCode, "DEN");
  assert.equal(ctx.destinationCode, "LGB");
}

// ── Seeded relocation's move_date wins over env when both present ──────

{
  const ctx = deriveMoveContext(
    { ...seededLongBeachMove, move_date: "2027-12-14" },
    ENV_MOVE_DATE,
  );
  assert.equal(ctx.moveDate, "2027-12-14", "relocation move_date is the source of truth");
}

// ── A cleared move_date stays cleared: env never stands in for it ──────

{
  const ctx = deriveMoveContext(
    { ...seededLongBeachMove, move_date: null },
    ENV_MOVE_DATE,
  );
  assert.equal(ctx.moveDate, null, "a relocation with no date has no date, whatever the env says");
}

// ── A different city pair resolves through the registry ───────────────

{
  const ctx = deriveMoveContext(
    { ...seededLongBeachMove, origin_slug: "sacramento", destination_slug: "denver" },
    ENV_MOVE_DATE,
  );
  assert.equal(ctx.originName, "Sacramento");
  assert.equal(ctx.originCode, "SAC");
  assert.equal(ctx.destinationName, "Denver");
  assert.equal(ctx.destinationCode, "DEN");
}

console.log("✅ move-context.test.ts passed");
