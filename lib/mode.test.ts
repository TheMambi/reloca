// Run: npx tsx lib/mode.test.ts
import assert from "node:assert/strict";
import { resolveMode, supabaseUrl } from "./mode";

// Stand-in values built at run time, so nothing here looks like a real key.
const filler = (label: string) => `${label}-${"x".repeat(12)}`;
const privateEnv = {
  RELOCA_MODE: "private",
  RELOCA_ACCESS_GATE: "vercel-authentication",
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY: filler("service"),
  RELOCA_SINGLE_USER_ID: filler("user"),
};

function refusal(env: Record<string, string | undefined>): string {
  try {
    resolveMode(env);
  } catch (err) {
    assert.ok(err instanceof Error);
    assert.match(err.message, /^Reloca refuses to serve:/);
    return err.message;
  }
  assert.fail(`expected a refusal for ${JSON.stringify(Object.keys(env))}`);
}

// ---- demo -------------------------------------------------------------------

assert.equal(resolveMode({ RELOCA_MODE: "demo" }), "demo");
// The older flag still selects the demo, so demos deployed with it keep working.
assert.equal(resolveMode({ RELOCA_DEMO_MODE: "1" }), "demo");
assert.equal(resolveMode({ RELOCA_MODE: "demo", RELOCA_DEMO_MODE: "1" }), "demo");
// A blank RELOCA_MODE (a copied template line) counts as unset.
assert.equal(resolveMode({ RELOCA_MODE: "", RELOCA_DEMO_MODE: "1" }), "demo");
// Demo needs nothing else, and database settings do not switch it to private.
assert.equal(resolveMode({ ...privateEnv, RELOCA_MODE: "demo" }), "demo");

// ---- no valid mode: refuse, never fall through to the database ---------------

assert.match(refusal({}), /no valid mode is set/);
assert.match(refusal({ RELOCA_MODE: "" }), /no valid mode is set/);
// Only the exact value 1 counts for the older flag.
for (const value of ["true", "TRUE", "yes", "on", "0", " 1", "1 ", "01"]) {
  assert.match(refusal({ RELOCA_DEMO_MODE: value }), /no valid mode is set/, `RELOCA_DEMO_MODE=${value}`);
}
// A mistyped mode is refused even when everything else is in place.
for (const value of ["privat", "Private", "PRIVATE", "private ", "live", "prod", "true", "1", "demo-mode"]) {
  assert.match(refusal({ ...privateEnv, RELOCA_MODE: value }), /no valid mode is set/, `RELOCA_MODE=${value}`);
  assert.match(refusal({ RELOCA_MODE: value, RELOCA_DEMO_MODE: "1" }), /no valid mode is set/, `RELOCA_MODE=${value} with the older flag`);
}
// The database settings alone never select private mode.
assert.match(refusal({ ...privateEnv, RELOCA_MODE: undefined }), /no valid mode is set/);

// ---- private ----------------------------------------------------------------

assert.equal(resolveMode(privateEnv), "private");
assert.equal(resolveMode({ ...privateEnv, RELOCA_DEMO_MODE: "0" }), "private");

// Without a named access gate, private mode is refused.
assert.match(refusal({ ...privateEnv, RELOCA_ACCESS_GATE: undefined }), /private mode is missing RELOCA_ACCESS_GATE\./);
assert.match(refusal({ ...privateEnv, RELOCA_ACCESS_GATE: "" }), /private mode is missing RELOCA_ACCESS_GATE\./);
assert.match(refusal({ ...privateEnv, RELOCA_ACCESS_GATE: "   " }), /private mode is missing RELOCA_ACCESS_GATE\./);

// Each required variable is named when it is missing or blank.
for (const name of [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RELOCA_SINGLE_USER_ID",
] as const) {
  assert.match(refusal({ ...privateEnv, [name]: undefined }), new RegExp(`private mode is missing ${name}\\.`));
  assert.match(refusal({ ...privateEnv, [name]: "" }), new RegExp(`private mode is missing ${name}\\.`));
}

// Everything missing is listed in one message.
assert.match(
  refusal({ RELOCA_MODE: "private" }),
  /private mode is missing RELOCA_ACCESS_GATE, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RELOCA_SINGLE_USER_ID\./,
);

// The anon key is not needed and not read: private mode runs without it.
assert.ok(!("NEXT_PUBLIC_SUPABASE_ANON_KEY" in privateEnv));
// A deployment set up before the rename still has the URL under its old name.
const { SUPABASE_URL: url, ...withoutUrl } = privateEnv;
assert.equal(resolveMode({ ...withoutUrl, NEXT_PUBLIC_SUPABASE_URL: url }), "private");
assert.equal(supabaseUrl({ NEXT_PUBLIC_SUPABASE_URL: "old" }), "old");
assert.equal(supabaseUrl({ SUPABASE_URL: "new", NEXT_PUBLIC_SUPABASE_URL: "old" }), "new");
assert.equal(supabaseUrl({}), undefined);

// Messages name variables and never repeat a value.
const partial = refusal({ ...privateEnv, SUPABASE_SERVICE_ROLE_KEY: undefined });
for (const value of [privateEnv.RELOCA_SINGLE_USER_ID, privateEnv.SUPABASE_URL, privateEnv.RELOCA_ACCESS_GATE]) {
  assert.ok(!partial.includes(value), "a refusal must not contain a value");
}
assert.ok(!refusal({ RELOCA_MODE: "liveish" }).includes("liveish"), "a refusal must not echo the mistyped mode");

// Private and the older demo flag together are a contradiction, not a silent choice.
assert.match(refusal({ ...privateEnv, RELOCA_DEMO_MODE: "1" }), /disagree/);

console.log("lib/mode.test.ts passed");
