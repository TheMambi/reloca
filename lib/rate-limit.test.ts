// Run: npx tsx lib/rate-limit.test.ts
import assert from "node:assert/strict";
import { clientKey, createRateLimiter } from "./rate-limit";

let clock = 0;
const limiter = createRateLimiter(30, 60_000, () => clock);

// 100 calls from one address inside a minute: 30 pass, 70 are refused.
const results = Array.from({ length: 100 }, () => limiter.allow("203.0.113.7"));
assert.equal(results.filter(Boolean).length, 30);
assert.deepEqual(results.slice(0, 30), Array(30).fill(true));
assert.equal(limiter.allow("203.0.113.8"), true, "another address has its own count");

clock += 59_999;
assert.equal(limiter.allow("203.0.113.7"), false, "still inside the window");
clock += 1;
assert.equal(limiter.allow("203.0.113.7"), true, "a new window starts");

// Made-up keys cannot grow the table without bound, and an evicted key simply starts over.
const small = createRateLimiter(1, 60_000, () => clock);
for (let i = 0; i < 20_000; i++) small.allow(`key-${i}`);
assert.equal(small.allow("key-19999"), false, "a recent key is still counted");
assert.equal(small.allow("key-0"), true, "the oldest key was dropped");

const headers = (h: Record<string, string>) => ({ get: (name: string) => h[name] ?? null });
assert.equal(clientKey(headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })), "203.0.113.7");
assert.equal(clientKey(headers({ "x-real-ip": "203.0.113.9" })), "203.0.113.9");
assert.equal(clientKey(headers({})), "unknown");

console.log("lib/rate-limit.test.ts passed");
