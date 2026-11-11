// Viewing-relocation resolution + option mapping (Phase 8 Wave C, C.2).
// Run via: `npx tsx lib/data/viewing-relocation.test.ts`
//
// Covers the server half of the switcher's URL-state round-trip: a `?relocation=`
// id resolves to that relocation; a stale/absent id falls back to the active
// move; an empty pool resolves to null. Plus the slug→name/code option mapper
// and the reference-context derivation a switched view recomputes from.

import assert from "node:assert/strict";
import {
  resolveViewingRelocation,
  pickViewingId,
  toRelocationOption,
  moveContextFor,
} from "./relocation-db";
import type { Relocation } from "@/schemas";

function reloc(over: Partial<Relocation>): Relocation {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    user_id: "11111111-1111-1111-1111-111111111111",
    label: "Test move",
    origin_slug: "denver",
    destination_slug: "long-beach",
    move_date: "2027-10-27",
    is_active_move: false,
    created_at: "2026-09-12T00:00:00+00:00",
    updated_at: "2026-09-12T00:00:00+00:00",
    ...over,
  };
}

const active = reloc({
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  label: "Long Beach move",
  destination_slug: "long-beach",
  is_active_move: true,
});
const sac = reloc({
  id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  label: "Sacramento what-if",
  destination_slug: "sacramento",
  move_date: null,
});
const pool = [active, sac];

// ── Resolution: explicit id wins ───────────────────────────────────────
assert.equal(
  resolveViewingRelocation(pool, sac.id)?.id,
  sac.id,
  "explicit ?relocation= id resolves to that relocation",
);

// ── Resolution: no id → active move ────────────────────────────────────
assert.equal(
  resolveViewingRelocation(pool, null)?.id,
  active.id,
  "absent id falls back to the active move",
);

// ── Resolution: stale id → active move ─────────────────────────────────
assert.equal(
  resolveViewingRelocation(pool, "deadbeef-0000-0000-0000-000000000000")?.id,
  active.id,
  "stale id falls back to the active move (never a blank view)",
);

// ── Resolution: empty pool → null ──────────────────────────────────────
assert.equal(
  resolveViewingRelocation([], null),
  null,
  "empty pool resolves to null",
);

// ── Resolution: no active → first ──────────────────────────────────────
assert.equal(
  resolveViewingRelocation([sac], null)?.id,
  sac.id,
  "with no active move, falls back to the first relocation",
);

// ── Option mapping resolves slugs → names + codes ──────────────────────
const opt = toRelocationOption(sac);
assert.equal(opt.originCode, "DEN", "origin code resolves from the registry");
assert.equal(opt.destinationCode, "SAC", "destination code resolves from the registry");
assert.equal(opt.destinationName, "Sacramento", "destination name resolves");
assert.equal(opt.isActive, false, "isActive carries through");

// ── A switched view recomputes its reference context ───────────────────
const ctx = moveContextFor(sac);
assert.equal(ctx.originSlug, "denver");
assert.equal(ctx.destinationSlug, "sacramento");
assert.equal(ctx.destinationCode, "SAC", "viewing context drives reference tiles to Sacramento");

// ── Precedence: param → cookie → null (Wave D, D.1) ────────────────────
// The full resolve precedence is param → cookie → active → first; pickViewingId
// owns the param-vs-cookie half, resolveViewingRelocation owns the fallback.
assert.equal(
  pickViewingId(sac.id, active.id),
  sac.id,
  "explicit ?relocation= param overrides the persisted cookie",
);
assert.equal(
  pickViewingId(null, sac.id),
  sac.id,
  "with no param, the persisted cookie selects the view (survives plain nav)",
);
assert.equal(
  pickViewingId(undefined, undefined),
  null,
  "no param and no cookie → null (resolver falls back to the active move)",
);
// Composed end-to-end: a cookie-only selection resolves to that relocation,
// proving the param→cookie→active chain reaches Sacramento on plain navigation.
assert.equal(
  resolveViewingRelocation(pool, pickViewingId(null, sac.id))?.id,
  sac.id,
  "cookie-only selection resolves to Sacramento after the param is dropped",
);

console.log("✅ viewing-relocation.test.ts passed");
