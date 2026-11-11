// Round-trip assertions for RelocationSchema (Wave B.1).
// Run via: `npx tsx lib/data/relocation.test.ts`
//
// Schema-only — the getActiveRelocation / getRelocations loaders are DB-bound
// and verified against the live table during B.4 (post-migration), not here.

import assert from "node:assert/strict";
import { RelocationSchema } from "@/schemas";

const valid = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  label: "Long Beach move",
  origin_slug: "denver",
  destination_slug: "long-beach",
  move_date: "2026-08-15",
  is_active_move: true,
  created_at: "2026-05-30T00:00:00.000+00:00",
  updated_at: "2026-05-30T00:00:00.000+00:00",
};

assert.deepEqual(RelocationSchema.parse(valid), valid, "valid relocation round-trips");

// move_date is nullable (a relocation without a committed date is legal).
RelocationSchema.parse({ ...valid, move_date: null });

// Rejections.
assert.throws(() => RelocationSchema.parse({ ...valid, id: "not-a-uuid" }), "rejects bad id");
assert.throws(() => RelocationSchema.parse({ ...valid, label: "" }), "rejects empty label");
assert.throws(
  () => RelocationSchema.parse({ ...valid, is_active_move: "yes" }),
  "rejects non-boolean is_active_move",
);
assert.throws(
  () => RelocationSchema.parse({ ...valid, created_at: "2026-05-30" }),
  "rejects a date-only created_at (timestamptz expected)",
);

console.log("✅ relocation.test.ts passed");
