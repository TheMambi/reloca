// Script-style assertions for the destination-fetch parsers and its request guard.
// Run via: `npx tsx --conditions=react-server lib/lease/destination-fetch.test.ts`
// No request leaves this machine: names and pages come from a stand-in, and the
// one real connection goes to a server this test starts on 127.0.0.1.
//
// We don't have Vitest/Jest in this project; this file is a self-contained
// node script that exits non-zero on assertion failure. Mirrors the pattern
// in `lib/lease/forecast.test.ts`.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as cheerio from "cheerio";

import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import {
  MAX_RESPONSE_BYTES,
  extractFromHtml,
  fetchDestinationFromUrl,
  getMissingRequired,
  isPublicAddress,
  parseJsonLd,
  parseOgMeta,
  parseRobots,
  pinnedGet,
  robotsAllows,
  type PageResponse,
  type ResolvedAddress,
  type Transport,
} from "./destination-fetch";

function loadFixture(name: string): string {
  return readFileSync(`lib/lease/__fixtures__/${name}`, "utf8");
}

// ---------- 1. JSON-LD listing ----------

{
  const html = loadFixture("jsonld-listing.html");
  const $ = cheerio.load(html);
  const ld = parseJsonLd($);

  assert.equal(ld.building_name, "Harborline Lofts", "ld building_name");
  assert.equal(ld.street_address, "200 Sample Avenue", "ld street_address");
  assert.equal(ld.city, "Long Beach", "ld city");
  assert.equal(ld.beds, 1, "ld beds");
  assert.equal(ld.baths, 1, "ld baths");
  assert.equal(ld.sqft, 720, "ld sqft");
  assert.equal(ld.pets_allowed, true, "ld pets_allowed");
  assert.deepEqual(
    ld.amenities,
    ["In-unit laundry", "Rooftop deck", "Bike room"],
    "ld amenities",
  );
  assert.equal(ld.monthly_rent_low, 2500, "ld monthly_rent_low");
  assert.equal(ld.monthly_rent_high, 3200, "ld monthly_rent_high");

  // End-to-end via extractFromHtml (jsonld should win, h1 in body matches anyway)
  const merged = extractFromHtml(html, "https://example.test/harborline");
  assert.equal(merged.building_name, "Harborline Lofts", "merged building_name");
  assert.equal(merged.source_url, "https://example.test/harborline", "merged source_url from arg");
  assert.deepEqual(getMissingRequired(merged), [], "no missing required for jsonld fixture");
}

// ---------- 2. OG-only ----------

{
  const html = loadFixture("og-only.html");
  const $ = cheerio.load(html);

  // No JSON-LD on this page
  const ld = parseJsonLd($);
  assert.deepEqual(ld, {}, "og fixture has no jsonld");

  const og = parseOgMeta($);
  assert.equal(og.building_name, "Wave & Wire", "og decodes &amp; entity");
  assert.match(og.notes ?? "", /East Village Arts District/, "og notes pulled from description");
  assert.equal(og.source_url, undefined, "the page's own og:url is not taken as the link");
  assert.equal(og.street_address, "300 Demo Street", "og business street_address");
  assert.equal(og.city, "Long Beach", "og business locality");

  const merged = extractFromHtml(html);
  assert.deepEqual(getMissingRequired(merged), [], "no missing required for og fixture");
}

// ---------- 3. Visible text is not read ----------

{
  // A page with a heading, an address line, prices and an amenities list, and
  // no structured data. None of it is guessed at.
  const html = loadFixture("heuristics.html");
  assert.deepEqual(extractFromHtml(html), {}, "nothing is taken from visible text");
  const withCredit = `<html><body><h1>Pier 9</h1><p>Get a $500 move-in credit</p>
    <p>2 Beds · 2 Baths · 950 sq ft</p><p class="address">123 Main St, Long Beach CA 90802</p></body></html>`;
  assert.deepEqual(extractFromHtml(withCredit), {}, "a move-in credit is not read as rent");

  const html2 = loadFixture("spa-shell.html");
  const merged = extractFromHtml(html2, "https://example.test/spa");
  assert.equal(merged.source_url, "https://example.test/spa", "the fetched address is kept");
  assert.deepEqual(getMissingRequired(merged).sort(), ["building_name", "city", "street_address"]);
}

// ---------- 4. Structured data details ----------

{
  const page = (ld: object, head = "") =>
    `<html><head>${head}<script type="application/ld+json">${JSON.stringify(ld)}</script></head><body></body></html>`;
  const listing = { "@type": "Apartment", name: "LD Name", numberOfBedrooms: 2, numberOfRooms: 5, url: "/listing/42" };
  const merged = extractFromHtml(page(listing), "https://example.test/buildings/pier");
  assert.equal(merged.beds, 2, "bedrooms, not total rooms");
  assert.equal(merged.source_url, "https://example.test/buildings/pier", "the link saved is the address that was read, not one the page names");
  assert.equal(extractFromHtml(page({ ...listing, numberOfBedrooms: undefined })).beds, 5, "total rooms only as a fallback");
  assert.equal(extractFromHtml(page(listing)).source_url, undefined, "no link without the address that was read");
  for (const hostile of ["javascript:alert(1)", "https://look-alike.test/sign-in"]) {
    const og = extractFromHtml(
      page(
        { "@type": "Apartment", name: "LD Name", url: hostile },
        `<meta property="og:title" content="OG Name" /><meta property="og:url" content="${hostile}" />`,
      ),
      "https://example.test/a/b",
    );
    assert.equal(og.building_name, "LD Name", "JSON-LD wins over Open Graph");
    assert.equal(og.source_url, "https://example.test/a/b", `a page cannot choose the saved link (${hostile})`);
  }
}

// ---------- 5. Hostile pages finish quickly ----------

{
  const wrap = (body: string) => `<html><head><title>t</title></head><body>${body}</body></html>`;
  const cases: Record<string, string> = {
    "digit run": wrap("9".repeat(MAX_RESPONSE_BYTES)),
    "comma run": wrap(",".repeat(MAX_RESPONSE_BYTES)),
    "dollar and spaces": wrap("$100" + " ".repeat(MAX_RESPONSE_BYTES)),
    "nested divs": wrap("<div>".repeat(100_000)),
    "5 MB of digits": wrap("9".repeat(5 * 1024 * 1024)),
    "deep JSON-LD": wrap(`<script type="application/ld+json">${"[".repeat(200_000)}</script>`),
    "wide JSON-LD": wrap(`<script type="application/ld+json">${JSON.stringify({ "@graph": Array.from({ length: 20_000 }, () => ({ "@type": "Thing" })) })}</script>`),
  };
  for (const [name, html] of Object.entries(cases)) {
    const started = performance.now();
    extractFromHtml(html, "https://example.test/");
    const ms = performance.now() - started;
    assert.ok(ms < 500, `${name} took ${Math.round(ms)} ms`);
  }
}

// ---------- 6. robots.txt ----------

{
  const rules = parseRobots(`
# comment
User-agent: *
Disallow: /private
Allow: /private/open
Disallow: /*.pdf$

User-agent: OtherBot
Disallow: /
`);
  assert.equal(robotsAllows(rules, "/"), true);
  assert.equal(robotsAllows(rules, "/private/x"), false);
  assert.equal(robotsAllows(rules, "/private/open/x"), true, "the longer Allow wins");
  assert.equal(robotsAllows(rules, "/a/b.pdf"), false);
  assert.equal(robotsAllows(rules, "/a/b.pdf?x=1"), true, "$ anchors the end");
  const named = parseRobots("User-agent: *\nAllow: /\n\nUser-agent: reloca\nDisallow: /listings");
  assert.equal(robotsAllows(named, "/listings/1"), false, "a group naming this reader replaces the * group");
  assert.equal(robotsAllows(parseRobots("User-agent: *\nDisallow:"), "/x"), true, "empty Disallow allows everything");
  assert.equal(robotsAllows(parseRobots("User-agent: a\nUser-agent: *\nDisallow: /"), "/x"), false, "agents can share a group");
  const started = performance.now();
  robotsAllows(parseRobots("User-agent: *\n" + ("Disallow: /" + "*a".repeat(99) + "\n").repeat(300)), "/" + "a".repeat(2000) + "b");
  assert.ok(performance.now() - started < 500, "a hostile robots.txt finishes quickly");
}

// ---------- 7. Address rules ----------

{
  const refusedAddresses = [
    "127.0.0.1", "0.0.0.0", "10.0.0.5", "172.31.255.1", "192.168.1.1", "100.64.0.1", "100.100.100.200",
    "169.254.169.254", "192.0.0.1", "198.18.0.1", "224.0.0.1", "255.255.255.255", "168.63.129.16",
    "::1", "::", "0:0:0:0:0:0:0:1", "::ffff:127.0.0.1", "::ffff:a00:1", "::ffff:8.8.8.8", "64:ff9b::a9fe:a9fe",
    "fd00:ec2::254", "fe80::1", "fe90::1", "febf::1", "fec0::1", "2002:a00:1::", "ff02::1", "not-an-address",
  ];
  for (const address of refusedAddresses) assert.equal(isPublicAddress(address), false, `${address} must be refused`);
  for (const address of ["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111"]) {
    assert.equal(isPublicAddress(address), true, `${address} is public`);
  }
}

// ---------- 8. The request guard, with stand-in names and pages ----------

const PUBLIC = "93.184.216.34";
const PAGE = `<html><head><script type="application/ld+json">${JSON.stringify({
  "@type": "Apartment",
  name: "INTERNAL-SECRET-NAME",
})}</script></head><body></body></html>`;

function standInNet(
  names: Record<string, ResolvedAddress[] | (() => ResolvedAddress[])>,
  pages: Record<string, Partial<PageResponse>> = {},
) {
  const resolved: string[] = [];
  const requested: { url: string; address: string }[] = [];
  const transport: Transport = {
    async resolve(host) {
      resolved.push(host);
      const hit = names[host];
      if (!hit) throw new Error(`getaddrinfo ENOTFOUND ${host}`);
      return typeof hit === "function" ? hit() : hit;
    },
    async get(url, address) {
      requested.push({ url: url.toString(), address: address.address });
      const robots = url.pathname === "/robots.txt";
      const page = pages[url.toString()] ?? (robots ? { status: 404 } : {});
      return { status: 200, location: null, contentType: "text/html; charset=utf-8", body: robots ? "" : PAGE, ...page };
    },
  };
  return { transport, resolved, requested };
}

async function runGuardTests() {
  const v4 = (address: string): ResolvedAddress[] => [{ address, family: 4 }];
  const v6 = (address: string): ResolvedAddress[] => [{ address, family: 6 }];
  const names: Record<string, ResolvedAddress[]> = {
    "public.example": v4(PUBLIC),
    localhost: [...v4("127.0.0.1"), ...v6("::1")],
    "metadata.google.internal": v4("169.254.169.254"),
    "internal.corp.example": v4("10.20.30.40"),
    "mixed.example": [...v4(PUBLIC), ...v4("10.0.0.1")],
    "v6mapped.example": v6("::ffff:10.0.0.1"),
    "nat64.example": v6("64:ff9b::a9fe:a9fe"),
    "v4compat.example": v6("::127.0.0.1"),
    "linklocal.example": v6("febf::1"),
    "sitelocal.example": v6("fec0::1"),
    "sixtofour.example": v6("2002:a00:1::"),
    "wireserver.example": v4("168.63.129.16"),
  };
  // Nothing in a refusal may tell the caller about addresses, status lines or headers.
  const leaks = /\d+\.\d+\.\d+|::|\b[1-5]\d\d\b|content-type|text\/|INTERNAL|example|localhost/i;
  const mustRefuse = async (label: string, url: string, pages: Record<string, Partial<PageResponse>> = {}) => {
    const net = standInNet(names, pages);
    const res = await fetchDestinationFromUrl(url, net.transport);
    assert.equal(res.status, "fetch_failed", `${label} must be refused`);
    if (res.status === "fetch_failed") assert.doesNotMatch(res.message, leaks, `${label}: the message gives detail away`);
    return net;
  };
  const silence = console.error;
  console.error = () => {};
  try {
    // A. literal addresses and URL forms: refused before any request.
    const literals = [
      "https://127.0.0.1/", "https://2130706433/", "https://0x7f000001/", "https://0177.0.0.1/", "https://127.1/",
      "https://0.0.0.0/", "https://169.254.169.254/latest/meta-data/", "https://10.0.0.5/", "https://172.31.255.1/",
      "https://192.168.1.1/", "https://100.64.0.1/", "https://[::1]/", "https://[::ffff:127.0.0.1]/",
      "https://[fd00:ec2::254]/", "https://[fe80::1]/", "https://user:pass@93.184.216.34/",
      "https://93.184.216.34@127.0.0.1/", "https://93.184.216.34:8080/", "https://93.184.216.34:80/",
      "http://93.184.216.34/", "http://public.example/", "file:///etc/passwd", "gopher://127.0.0.1:70/_x",
      "ftp://93.184.216.34/", "data:text/html,<h1>x</h1>", "javascript:alert(1)", "not a url",
    ];
    for (const url of literals) {
      const net = await mustRefuse(url, url);
      assert.deepEqual(net.requested, [], `${url}: no request may be made`);
    }
    // B. names that resolve to a non-public address.
    for (const host of Object.keys(names).filter((h) => h !== "public.example")) {
      const net = await mustRefuse(host, `https://${host}/`);
      assert.deepEqual(net.requested, [], `${host}: no request may be made`);
    }
    assert.deepEqual((await mustRefuse("unresolvable", "https://nope.invalid/")).requested, []);

    // C. redirects are vetted hop by hop.
    const hops: Record<string, string> = {
      "to a metadata literal": "https://169.254.169.254/latest/meta-data/",
      "to an internal name": "https://internal.corp.example/admin",
      "to a file": "file:///etc/passwd",
      "to another port": "https://public.example:8443/x",
      "to plain http": "http://public.example/x",
      "to itself": "/r",
      "to a scheme-relative loopback": "//127.0.0.1/x",
    };
    for (const [label, location] of Object.entries(hops)) {
      const net = await mustRefuse(`redirect ${label}`, "https://public.example/r", {
        "https://public.example/r": { status: 302, location },
      });
      for (const r of net.requested) assert.equal(r.address, PUBLIC, `redirect ${label}: a request left for ${r.address}`);
    }

    // D. rebinding: the name answers a public address once and a private one
    // ever after. It is asked once, and every request goes to the first answer.
    let asked = 0;
    const rebind = standInNet({
      "rebind.example": () => (++asked === 1 ? v4(PUBLIC) : v4("169.254.169.254")),
    });
    const ok = await fetchDestinationFromUrl("https://rebind.example/latest/meta-data/iam/", rebind.transport);
    assert.equal(ok.status, "needs_review");
    assert.equal(asked, 1, "the name is resolved once");
    assert.deepEqual(rebind.requested, [
      { url: "https://rebind.example/robots.txt", address: PUBLIC },
      { url: "https://rebind.example/latest/meta-data/iam/", address: PUBLIC },
    ]);

    // E. upstream failures use the same message.
    await mustRefuse("404", "https://public.example/p", { "https://public.example/p": { status: 404 } });
    await mustRefuse("wrong type", "https://public.example/p", {
      "https://public.example/p": { contentType: "application/x-secret-thing" },
    });

    // F. robots.txt is asked first and obeyed.
    const disallowed = standInNet(names, {
      "https://public.example/robots.txt": { body: "User-agent: *\nDisallow: /listings" },
    });
    const refused = await fetchDestinationFromUrl("https://public.example/listings/42", disallowed.transport);
    assert.equal(refused.status, "fetch_failed");
    assert.deepEqual(disallowed.requested.map((r) => r.url), ["https://public.example/robots.txt"], "the page is not requested");
    const broken = standInNet(names, { "https://public.example/robots.txt": { status: 503 } });
    assert.equal((await fetchDestinationFromUrl("https://public.example/a", broken.transport)).status, "fetch_failed");
    assert.equal(broken.requested.length, 1, "a robots.txt server error means do not read");
    const allowed = standInNet(names, {
      "https://public.example/robots.txt": { body: "User-agent: *\nDisallow: /private" },
    });
    assert.equal((await fetchDestinationFromUrl("https://public.example/buildings/pier", allowed.transport)).status, "needs_review");
  } finally {
    console.error = silence;
  }

  // G. The real request connects to the address it is handed. The name below
  // does not resolve at all, so reaching the server proves the system resolver
  // was not asked.
  const seenHosts: string[] = [];
  const server = createServer((req, res) => {
    seenHosts.push(req.headers.host ?? "");
    res.writeHead(200, { "content-type": "text/html" });
    res.end("x".repeat(req.url === "/big" ? 5000 : 10));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    const here = { address: "127.0.0.1", family: 4 };
    const res = await pinnedGet(new URL(`http://vetted-name.invalid:${port}/`), here, 1000);
    assert.equal(res.status, 200);
    assert.equal(res.body, "x".repeat(10));
    assert.deepEqual(seenHosts, [`vetted-name.invalid:${port}`], "the name is still sent as Host");
    await assert.rejects(pinnedGet(new URL(`http://vetted-name.invalid:${port}/big`), here, 1000), "the size cap applies");
  } finally {
    server.close();
  }
}

runGuardTests()
  .then(() => {
    console.log("destination-fetch.test.ts ✅");
  })
  .catch((err) => {
    console.error("destination-fetch.test.ts ❌");
    console.error(err);
    process.exitCode = 1;
  });
