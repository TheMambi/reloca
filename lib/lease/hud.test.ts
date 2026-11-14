// Script-style assertions for the HUD FMR helpers via __internals — the test
// that export was created for and never got (Wave 6, AD-044). No live calls.
// Run via: `npx tsx lib/lease/hud.test.ts`

import assert from "node:assert/strict";

// hud.ts reads the key when it loads, so the key is set before the import.
async function main() {
  process.env.HUD_FMR_API_KEY = `test-${"k".repeat(8)}`;
  const { __internals, getFmr } = await import("./hud");
  const { bedToKey, coerceMoney, coerceYear } = __internals;

  // bedToKey: integer 0–4 maps to the HUD column names; everything else null.
  assert.equal(bedToKey(0), "Efficiency");
  assert.equal(bedToKey(2), "Two-Bedroom");
  assert.equal(bedToKey(4), "Four-Bedroom");
  assert.equal(bedToKey(5), null);
  assert.equal(bedToKey(-1), null);
  assert.equal(bedToKey(2.5), null);

  // coerceMoney: numbers pass through; "$3,080" style strings clean up; junk → null.
  assert.equal(coerceMoney(3080), 3080);
  assert.equal(coerceMoney("$3,080"), 3080);
  assert.equal(coerceMoney(" 2 903 "), 2903);
  assert.equal(coerceMoney(""), null);
  assert.equal(coerceMoney("n/a"), null);
  assert.equal(coerceMoney(undefined), null);

  // coerceYear: 4-digit strings + integers only.
  assert.equal(coerceYear(2026), 2026);
  assert.equal(coerceYear("2026"), 2026);
  assert.equal(coerceYear("26"), null);
  assert.equal(coerceYear(2026.5), null);
  assert.equal(coerceYear(null), null);

  // getFmr: only an answer from HUD is cached. A timeout or an error response
  // must leave the next lookup free to try again.
  const realFetch = globalThis.fetch;
  const calls: string[] = [];
  let answer: () => Promise<Response> = async () => { throw new Error("timeout"); };
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    return answer();
  };
  const sacramento = "METRO40900M40900";

  assert.deepEqual(await getFmr(sacramento, null, 2), { value: null, year: null }, "timeout gives nulls");
  answer = async () => new Response("busy", { status: 503 });
  assert.deepEqual(await getFmr(sacramento, null, 2), { value: null, year: null }, "error response gives nulls");
  answer = async () => Response.json({ data: { year: "2026", basicdata: { "Two-Bedroom": "$2,100" } } });
  assert.deepEqual(await getFmr(sacramento, null, 2), { value: 2100, year: 2026 }, "third try succeeds: failures were not cached");
  assert.equal(calls.length, 3);
  assert.ok(calls.every((url) => url.endsWith(`/${sacramento}`)), "the lookup is made for the entity it was given");
  await getFmr(sacramento, null, 2);
  assert.equal(calls.length, 3, "a real answer is cached");

  globalThis.fetch = realFetch;
  console.log("hud.test.ts ✅");
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
