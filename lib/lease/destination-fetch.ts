// Cheerio-based extractor for apartment marketing pages.
//
// AD-012 binds Wave B to free-only ingestion: no Apify, no HasData, no Zillow
// API. The user pastes a URL; we fetch the static HTML and try three strategies
// in priority order — JSON-LD (schema.org), then OpenGraph/business meta, then
// CSS heuristics on common selectors. Whatever fields we can't extract are
// returned in `missing` so the dialog can ask the user to fill them in.
//
// Server-only. Single-user, authenticated callers, but the user pastes the
// URL — so an SSRF guard still earns its keep against a misclick into a
// private IP / link-local address. We pre-resolve DNS and reject private
// ranges before fetching, and we re-validate every redirect hop.

import "server-only";
import * as cheerio from "cheerio";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

import type { Destination } from "../../schemas/lease";

// ---------- types ----------

export type DestinationInput = Pick<
  Destination,
  | "building_name"
  | "street_address"
  | "city"
  | "state_code"
  | "zip_code"
  | "source_url"
  | "monthly_rent_low"
  | "monthly_rent_high"
  | "application_fee"
  | "security_deposit"
  | "pet_rent_monthly"
  | "parking_monthly"
  | "beds"
  | "baths"
  | "sqft"
  | "amenities"
  | "pets_allowed"
  | "furnished"
  | "insurance_required"
  | "insurance_min_liability"
  | "insurance_min_property"
  | "notes"
>;

export type FetchResult =
  | { status: "fetch_failed"; message: string }
  | {
      status: "needs_review";
      data: Partial<DestinationInput>;
      missing: (keyof DestinationInput)[];
    };

type CheerioRoot = ReturnType<typeof cheerio.load>;

// ---------- constants ----------

const REQUIRED_FIELDS: readonly (keyof DestinationInput)[] = [
  "building_name",
  "street_address",
  "city",
] as const;

const FETCH_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const USER_AGENT =
  "Reloca/0.1 (+https://github.com/TheMambi/reloca)";

// schema.org @types we treat as housing entities
const LD_HOUSING_TYPES = new Set([
  "Apartment",
  "ApartmentComplex",
  "Residence",
  "SingleFamilyResidence",
  "Place",
  "LodgingBusiness",
  "RealEstateListing",
  "Accommodation",
  "Hotel",
]);

// ---------- public API ----------

export async function fetchDestinationFromUrl(url: string): Promise<FetchResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { status: "fetch_failed", message: "Invalid URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      status: "fetch_failed",
      message: `Unsupported protocol: ${parsed.protocol}`,
    };
  }

  try {
    const { html, finalUrl } = await safeFetch(parsed.toString());
    const data = extractFromHtml(html, finalUrl);
    const missing = getMissingRequired(data);
    return { status: "needs_review", data, missing };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: "fetch_failed", message };
  }
}

export function extractFromHtml(
  html: string,
  sourceUrl?: string,
): Partial<DestinationInput> {
  const $ = cheerio.load(html);
  const ld = parseJsonLd($);
  const og = parseOgMeta($);
  const heur = parseHeuristics($);
  // Priority: jsonld > og > heuristics. Later spread wins.
  const merged: Partial<DestinationInput> = { ...heur, ...og, ...ld };
  if (sourceUrl && !merged.source_url) merged.source_url = sourceUrl;
  return merged;
}

export function getMissingRequired(
  data: Partial<DestinationInput>,
): (keyof DestinationInput)[] {
  return REQUIRED_FIELDS.filter((k) => {
    const v = data[k];
    return v == null || (typeof v === "string" && v.trim() === "");
  });
}

// ---------- parsers ----------

export function parseJsonLd($: CheerioRoot): Partial<DestinationInput> {
  const out: Partial<DestinationInput> = {};
  const scripts = $('script[type="application/ld+json"]');
  scripts.each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw.trim()) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    for (const item of flattenLd(parsed)) {
      mergeFromLdItem(out, item);
    }
  });
  return out;
}

export function parseOgMeta($: CheerioRoot): Partial<DestinationInput> {
  const out: Partial<DestinationInput> = {};

  const title = $('meta[property="og:title"]').attr("content");
  if (title && title.trim()) out.building_name = title.trim();

  const desc = $('meta[property="og:description"]').attr("content");
  if (desc && desc.trim()) out.notes = desc.trim();

  const ogUrl = $('meta[property="og:url"]').attr("content");
  if (ogUrl && ogUrl.trim()) out.source_url = ogUrl.trim();

  const street = $(
    'meta[property="business:contact_data:street_address"]',
  ).attr("content");
  if (street && street.trim()) out.street_address = street.trim();

  const locality = $('meta[property="business:contact_data:locality"]').attr(
    "content",
  );
  if (locality && locality.trim()) out.city = locality.trim();

  const region = $('meta[property="business:contact_data:region"]').attr(
    "content",
  );
  if (region) {
    const code = region.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(code)) out.state_code = code;
  }

  const postal = $('meta[property="business:contact_data:postal_code"]').attr(
    "content",
  );
  if (postal) {
    const m = postal.match(/^\d{5}(?:-\d{4})?$/);
    if (m) out.zip_code = m[0];
  }

  return out;
}

export function parseHeuristics($: CheerioRoot): Partial<DestinationInput> {
  const out: Partial<DestinationInput> = {};

  const h1 = $("h1").first().text().trim();
  if (h1) out.building_name = h1;

  const addrText =
    $('[itemprop="address"]').first().text().trim() ||
    $('[class*="address" i]').first().text().trim() ||
    $("address").first().text().trim();
  if (addrText) {
    const parts = addrText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length >= 2) {
      out.street_address = parts[0];
      out.city = parts[1];
    } else if (parts.length === 1) {
      out.street_address = parts[0];
    }
    // Pull state code + zip from "City, ST 90802" or "Long Beach CA 90802".
    const tail = parts.length >= 3 ? parts.slice(2).join(", ") : addrText;
    const stateZipMatch = tail.match(/\b([A-Z]{2})\b\s+(\d{5}(?:-\d{4})?)/);
    if (stateZipMatch) {
      if (!out.state_code) out.state_code = stateZipMatch[1];
      if (!out.zip_code) out.zip_code = stateZipMatch[2];
    } else {
      const zipOnly = addrText.match(/\b(\d{5}(?:-\d{4})?)\b/);
      if (zipOnly && !out.zip_code) out.zip_code = zipOnly[1];
    }
  }

  const bodyText = $("body").text();

  // "$2,150 - $2,675 / month" or "$2,500/mo"
  const rentMatch = bodyText.match(
    /\$([\d,]{3,7})(?:\s*[-–]\s*\$([\d,]{3,7}))?\s*\/?\s*(?:mo|month)/i,
  );
  if (rentMatch) {
    const low = parseMoney(rentMatch[1]);
    const high = rentMatch[2] ? parseMoney(rentMatch[2]) : null;
    if (low != null) out.monthly_rent_low = low;
    if (high != null) out.monthly_rent_high = high;
  }

  if (/\bstudio\b/i.test(bodyText) && out.beds == null) out.beds = 0;
  const bedMatch = bodyText.match(/(\d+)\s*(?:bed|br|bd)\b/i);
  if (bedMatch) {
    const n = Number(bedMatch[1]);
    if (Number.isFinite(n)) out.beds = n;
  }

  const bathMatch = bodyText.match(/(\d+(?:\.\d+)?)\s*(?:bath|ba)\b/i);
  if (bathMatch) {
    const n = Number(bathMatch[1]);
    if (Number.isFinite(n)) out.baths = n;
  }

  const sqftMatch = bodyText.match(
    /([\d,]+)\s*(?:sq\.?\s*ft|sqft|square feet)/i,
  );
  if (sqftMatch) {
    const n = Number(sqftMatch[1].replace(/,/g, ""));
    if (Number.isFinite(n)) out.sqft = Math.round(n);
  }

  // amenities: heading containing "amenit*" followed by a list
  const amenHeader = $("h2, h3")
    .filter((_, el) => /amenit/i.test($(el).text()))
    .first();
  if (amenHeader.length) {
    const list = amenHeader.nextAll("ul, ol").first();
    if (list.length) {
      const items = list
        .find("li")
        .map((_, el) => $(el).text().trim())
        .get()
        .filter(Boolean);
      if (items.length) out.amenities = items;
    }
  }

  return out;
}

// ---------- JSON-LD helpers ----------

function flattenLd(v: unknown): Record<string, unknown>[] {
  if (Array.isArray(v)) return v.flatMap(flattenLd);
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if (Array.isArray(obj["@graph"])) return flattenLd(obj["@graph"]);
    return [obj];
  }
  return [];
}

function mergeFromLdItem(
  out: Partial<DestinationInput>,
  item: Record<string, unknown>,
): void {
  const rawType = item["@type"];
  const types: string[] = Array.isArray(rawType)
    ? rawType.filter((t): t is string => typeof t === "string")
    : typeof rawType === "string"
      ? [rawType]
      : [];
  if (!types.some((t) => LD_HOUSING_TYPES.has(t))) return;

  if (typeof item.name === "string" && !out.building_name) {
    out.building_name = item.name;
  }
  if (typeof item.url === "string" && !out.source_url) {
    out.source_url = item.url;
  }

  const addr = item.address;
  if (addr && typeof addr === "object") {
    const a = addr as Record<string, unknown>;
    if (typeof a.streetAddress === "string" && !out.street_address) {
      out.street_address = a.streetAddress;
    }
    if (typeof a.addressLocality === "string" && !out.city) {
      out.city = a.addressLocality;
    }
    if (typeof a.addressRegion === "string" && !out.state_code) {
      const region = a.addressRegion.trim().toUpperCase();
      if (/^[A-Z]{2}$/.test(region)) out.state_code = region;
    }
    if (typeof a.postalCode === "string" && !out.zip_code) {
      const m = a.postalCode.match(/^\d{5}(?:-\d{4})?$/);
      if (m) out.zip_code = m[0];
    }
  }

  const beds = coerceNumber(item.numberOfRooms);
  if (beds != null && out.beds == null) out.beds = beds;

  const baths = coerceNumber(item.numberOfBathroomsTotal);
  if (baths != null && out.baths == null) out.baths = baths;

  const fs = item.floorSize;
  if (fs && typeof fs === "object") {
    const sqft = coerceNumber((fs as Record<string, unknown>).value);
    if (sqft != null && out.sqft == null) out.sqft = Math.round(sqft);
  }

  if (typeof item.petsAllowed === "boolean" && out.pets_allowed == null) {
    out.pets_allowed = item.petsAllowed;
  }

  if (Array.isArray(item.amenityFeature) && !out.amenities) {
    const list: string[] = [];
    for (const a of item.amenityFeature) {
      if (typeof a === "string") list.push(a);
      else if (a && typeof a === "object") {
        const name = (a as Record<string, unknown>).name;
        if (typeof name === "string" && name.trim()) list.push(name.trim());
      }
    }
    if (list.length) out.amenities = list;
  }

  const offer = item.offers;
  if (offer && typeof offer === "object") {
    const o = offer as Record<string, unknown>;
    const ps = o.priceSpecification;
    if (ps && typeof ps === "object") {
      const p = ps as Record<string, unknown>;
      const currency =
        typeof p.priceCurrency === "string"
          ? p.priceCurrency.toUpperCase()
          : typeof o.priceCurrency === "string"
            ? o.priceCurrency.toUpperCase()
            : null;
      if (currency == null || currency === "USD") {
        const min = coerceNumber(p.minPrice);
        const max = coerceNumber(p.maxPrice);
        if (min != null && out.monthly_rent_low == null) {
          out.monthly_rent_low = min;
        }
        if (max != null && out.monthly_rent_high == null) {
          out.monthly_rent_high = max;
        }
      }
    }
  }
}

// ---------- small utils ----------

function parseMoney(s: string): number | null {
  const cleaned = s.replace(/[$,\s]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function coerceNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// ---------- SSRF guard + fetch ----------

function isPrivateIp(ip: string): boolean {
  if (/^127\./.test(ip)) return true;
  if (/^10\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^169\.254\./.test(ip)) return true; // link-local incl. cloud IMDS
  if (/^0\./.test(ip)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip)) return true; // CGNAT 100.64.0.0/10
  if (/^22[4-9]\.|^23\d\./.test(ip)) return true; // multicast/reserved
  if (/^(24\d|25[0-5])\./.test(ip)) return true; // 240.0.0.0/4 reserved + broadcast
  if (/^192\.0\.0\./.test(ip)) return true; // IETF protocol assignments
  if (/^198\.1[89]\./.test(ip)) return true; // benchmark 198.18.0.0/15
  if (ip === "::1") return true;
  if (/^::ffff:/i.test(ip)) return isPrivateIp(ip.replace(/^::ffff:/i, ""));
  if (/^f[cd]/i.test(ip)) return true; // ULA fc00::/7
  if (/^fe80/i.test(ip)) return true; // link-local
  if (/^::$/.test(ip)) return true;
  return false;
}
// Residual (documented, accepted for a single-user tool): DNS rebinding TOCTOU —
// fetch() re-resolves after assertHostIsPublic; a short-TTL host could flip to a
// private IP between check and connect. Full mitigation would pin the socket to
// the validated address, which undici's fetch doesn't expose cleanly.

async function assertHostIsPublic(host: string): Promise<void> {
  if (isIP(host)) {
    if (isPrivateIp(host)) {
      throw new Error(`Refused: private IP ${host}`);
    }
    return;
  }
  const records = await dnsLookup(host, { all: true });
  if (records.length === 0) {
    throw new Error(`Refused: ${host} did not resolve`);
  }
  for (const r of records) {
    if (isPrivateIp(r.address)) {
      throw new Error(
        `Refused: ${host} resolves to private IP ${r.address}`,
      );
    }
  }
}

async function safeFetch(
  initialUrl: string,
): Promise<{ html: string; finalUrl: string }> {
  let current = initialUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = new URL(current);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new Error(`Refused: protocol ${u.protocol} on redirect`);
    }
    // Listings live on standard web ports; anything else is a probe vector.
    if (u.port && u.port !== "80" && u.port !== "443") {
      throw new Error(`Refused: non-standard port ${u.port}`);
    }
    await assertHostIsPublic(u.hostname);

    const res = await fetch(current, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        Accept: "text/html, application/xhtml+xml",
        "User-Agent": USER_AGENT,
      },
    });

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error(`Redirect ${res.status} without Location`);
      current = new URL(loc, current).toString();
      // cancel response body so we don't leak the socket
      try {
        await res.body?.cancel();
      } catch {
        /* ignore */
      }
      continue;
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`.trim());
    }

    const ct = res.headers.get("content-type") ?? "";
    if (!/^(text\/html|application\/xhtml\+xml)/i.test(ct)) {
      throw new Error(`Unexpected content-type: ${ct || "(none)"}`);
    }

    const html = await readBodyCapped(res, MAX_RESPONSE_BYTES);
    return { html, finalUrl: current };
  }
  throw new Error(`Too many redirects (>${MAX_REDIRECTS})`);
}

async function readBodyCapped(res: Response, max: number): Promise<string> {
  if (!res.body) return await res.text();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        throw new Error(`Response exceeds ${max}-byte cap`);
      }
      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    buf.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}
