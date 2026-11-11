// Script-style assertions for the destination-fetch parsers.
// Run via: `npx tsx lib/lease/destination-fetch.test.ts`
//
// We don't have Vitest/Jest in this project; this file is a self-contained
// node script that exits non-zero on assertion failure. Mirrors the pattern
// in `lib/lease/forecast.test.ts`.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as cheerio from "cheerio";

import {
  extractFromHtml,
  fetchDestinationFromUrl,
  getMissingRequired,
  parseHeuristics,
  parseJsonLd,
  parseOgMeta,
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
  assert.equal(og.source_url, "https://example.test/wave-and-wire/", "og source_url");
  assert.equal(og.street_address, "300 Demo Street", "og business street_address");
  assert.equal(og.city, "Long Beach", "og business locality");

  const merged = extractFromHtml(html);
  assert.deepEqual(getMissingRequired(merged), [], "no missing required for og fixture");
}

// ---------- 3. CSS heuristics ----------

{
  const html = loadFixture("heuristics.html");
  const $ = cheerio.load(html);

  // No JSON-LD, no OG on this page
  assert.deepEqual(parseJsonLd($), {}, "heuristics fixture has no jsonld");
  assert.deepEqual(parseOgMeta($), {}, "heuristics fixture has no og");

  const heur = parseHeuristics($);
  assert.equal(heur.building_name, "Pier 41 Residences", "heur h1 → building_name");
  assert.equal(heur.street_address, "100 Example Boulevard", "heur address split street");
  assert.equal(heur.city, "Long Beach", "heur address split city");
  // The pricing line is "Studios from $1,895 / 1 BR from $2,150 - $2,675 / month".
  // Our regex requires a /mo or /month suffix, so it matches the range, not the studio number.
  assert.equal(heur.monthly_rent_low, 2150, "heur rent low");
  assert.equal(heur.monthly_rent_high, 2675, "heur rent high");
  assert.equal(heur.beds, 1, "heur beds");
  assert.equal(heur.baths, 1, "heur baths");
  assert.equal(heur.sqft, 625, "heur sqft");
  assert.deepEqual(
    heur.amenities,
    ["Saltwater pool", "Co-working lounge", "Pet spa"],
    "heur amenities under <h2>Amenities</h2>",
  );

  const merged = extractFromHtml(html);
  assert.deepEqual(getMissingRequired(merged), [], "no missing required for heuristics fixture");
}

// ---------- 4. SPA shell (graceful failure) ----------

{
  const html = loadFixture("spa-shell.html");
  const $ = cheerio.load(html);

  assert.deepEqual(parseJsonLd($), {}, "spa shell has no jsonld");
  assert.deepEqual(parseOgMeta($), {}, "spa shell has no og");
  assert.deepEqual(parseHeuristics($), {}, "spa shell has no heuristics-extractable content");

  const merged = extractFromHtml(html, "https://example.test/spa");
  // Only source_url makes it through
  assert.equal(merged.source_url, "https://example.test/spa", "spa shell still records source_url from arg");
  assert.equal(merged.building_name, undefined, "spa shell yields no building_name");

  const missing = getMissingRequired(merged);
  assert.deepEqual(
    missing.sort(),
    ["building_name", "city", "street_address"],
    "spa shell flags all 3 required fields as missing",
  );
}

// ---------- 5. Merge priority: jsonld > og > heuristics ----------

{
  // Hand-crafted fixture that conflicts on building_name across all 3 strategies.
  const html = `<!doctype html>
<html><head>
<title>X</title>
<meta property="og:title" content="OG Name" />
<meta property="business:contact_data:street_address" content="OG Street" />
<meta property="business:contact_data:locality" content="OG City" />
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Apartment","name":"LD Name",
"address":{"@type":"PostalAddress","streetAddress":"LD Street","addressLocality":"LD City"}}
</script>
</head><body><h1>Heuristics Name</h1>
<p class="address">Heuristics Street, Heuristics City</p>
</body></html>`;
  const merged = extractFromHtml(html);
  assert.equal(merged.building_name, "LD Name", "jsonld wins over og + heuristics");
  assert.equal(merged.street_address, "LD Street", "jsonld wins on street");
  assert.equal(merged.city, "LD City", "jsonld wins on city");
}

// ---------- 6. fetchDestinationFromUrl input validation (no network) ----------

async function runFetchValidation() {
  const bad = await fetchDestinationFromUrl("not a url");
  assert.equal(bad.status, "fetch_failed", "invalid URL → fetch_failed");

  const ftp = await fetchDestinationFromUrl("ftp://example.test/foo");
  assert.equal(ftp.status, "fetch_failed", "ftp protocol → fetch_failed");

  // Literal private IP — short-circuits before any network call.
  const localhost = await fetchDestinationFromUrl("http://127.0.0.1/");
  assert.equal(localhost.status, "fetch_failed", "127.0.0.1 → fetch_failed");
  assert.match(
    (localhost as { status: "fetch_failed"; message: string }).message,
    /private IP/i,
    "127.0.0.1 message mentions private IP",
  );

  const linkLocal = await fetchDestinationFromUrl(
    "http://169.254.169.254/latest/meta-data/",
  );
  assert.equal(
    linkLocal.status,
    "fetch_failed",
    "link-local IMDS IP → fetch_failed",
  );

  const ipv6 = await fetchDestinationFromUrl("http://[::1]/");
  assert.equal(ipv6.status, "fetch_failed", "::1 → fetch_failed");
}

runFetchValidation()
  .then(() => {
    console.log("destination-fetch.test.ts ✅");
  })
  .catch((err) => {
    console.error("destination-fetch.test.ts ❌");
    console.error(err);
    process.exitCode = 1;
  });
