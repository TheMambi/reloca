// Run: npx tsx lib/security-headers.test.ts
import assert from "node:assert/strict";
import { allowsIndexing, contentSecurityPolicy, securityHeaders } from "./security-headers";

const value = (mode: "demo" | "private", key: string) => securityHeaders(mode).find((h) => h.key === key)?.value;

// ---- the fixed headers, in both modes ----
for (const mode of ["demo", "private"] as const) {
  assert.equal(value(mode, "X-Content-Type-Options"), "nosniff");
  assert.equal(value(mode, "X-Frame-Options"), "DENY");
  assert.equal(value(mode, "Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.equal(value(mode, "Cross-Origin-Opener-Policy"), "same-origin");
  assert.match(value(mode, "Strict-Transport-Security") ?? "", /^max-age=\d{8}/);
  for (const feature of ["camera", "microphone", "geolocation"]) {
    assert.match(value(mode, "Permissions-Policy") ?? "", new RegExp(`${feature}=\\(\\)`));
  }
}

// ---- only the demo may be indexed ----
assert.equal(value("private", "X-Robots-Tag"), "noindex, nofollow");
assert.equal(value("demo", "X-Robots-Tag"), undefined);
assert.equal(allowsIndexing("private"), false);
assert.equal(allowsIndexing("demo"), true);

// ---- the policy ----
const nonce = "bm9uY2U=";
const policy = contentSecurityPolicy(nonce, false);
const directive = (name: string) => policy.split("; ").find((d) => d.startsWith(`${name} `));
assert.equal(directive("default-src"), "default-src 'self'");
assert.equal(directive("script-src"), `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`);
assert.equal(directive("frame-ancestors"), "frame-ancestors 'none'");
assert.equal(directive("object-src"), "object-src 'none'");
assert.equal(directive("base-uri"), "base-uri 'self'");
assert.equal(directive("form-action"), "form-action 'self'");
// Scripts are never allowed inline or by evaluation in a build.
assert.doesNotMatch(directive("script-src")!, /unsafe-inline|unsafe-eval|\*|https?:/);
// The only outside host is the map's tile server, and only for images and requests.
const outside = [...policy.matchAll(/https?:\/\/[^\s;]+/g)].map((m) => m[0]);
assert.deepEqual([...new Set(outside)], ["https://basemaps.cartocdn.com"]);
assert.match(directive("worker-src")!, /blob:/, "the map runs a worker");
// The dev server needs evaluation for hot reload, and nothing else changes.
assert.equal(contentSecurityPolicy(nonce, true), policy.replace("'strict-dynamic'", "'strict-dynamic' 'unsafe-eval'"));
// One header line: a line break would end the header.
assert.doesNotMatch(policy, /[\r\n]/);

console.log("lib/security-headers.test.ts passed");
