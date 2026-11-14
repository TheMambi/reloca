// Run: npx tsx --conditions=react-server lib/lease/geocode.test.ts
//
// No request leaves this machine: the lookup, the clock and the wait are stand-ins.
import assert from "node:assert/strict";
import { GEOCODE_CACHE_MAX, geocodeAddress, geocodeCacheSize, type GeocodeDeps } from "./geocode";

async function main() {
  let clock = 1_000_000;
  const waits: number[] = [];
  let sent = 0;
  const deps: GeocodeDeps = {
    now: () => clock,
    // The clock stands still, so each wait is measured from the same instant.
    sleep: async (ms) => {
      waits.push(ms);
    },
    fetch: (async () => {
      sent += 1;
      return new Response(JSON.stringify([{ lat: "38.58", lon: "-121.49" }]), { status: 200 });
    }) as typeof fetch,
  };

  // Three lookups started in the same instant: the first leaves at once, the
  // second a second later, the third a second after that.
  const answers = await Promise.all(["1 A St", "2 B St", "3 C St"].map((a) => geocodeAddress(a, deps)));
  assert.deepEqual(answers[0], { lat: 38.58, lng: -121.49 });
  assert.equal(sent, 3);
  assert.deepEqual(waits, [1000, 2000]);

  // A repeat is answered from memory and spends no request.
  await geocodeAddress("  1 a st ", deps);
  assert.equal(sent, 3);

  // A burst does not queue without end: lookups past the wait limit are skipped.
  clock += 60_000;
  const burst = await Promise.all(Array.from({ length: 20 }, (_, i) => geocodeAddress(`burst ${i}`, deps)));
  assert.ok(burst.filter((r) => r === null).length >= 10, "most of a burst is skipped");

  // The cache never grows past its ceiling, whatever the caller types.
  for (let i = 0; i < GEOCODE_CACHE_MAX + 200; i++) {
    clock += 2000;
    await geocodeAddress(`${i} Filler Road`, deps);
    assert.ok(geocodeCacheSize() <= GEOCODE_CACHE_MAX);
  }
  assert.equal(geocodeCacheSize(), GEOCODE_CACHE_MAX);

  // Text far longer than an address is not sent anywhere.
  const before = sent;
  assert.equal(await geocodeAddress("x".repeat(5000), deps), null);
  assert.equal(sent, before);

  console.log("lib/lease/geocode.test.ts passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
