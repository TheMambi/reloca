// Reads the structured data a building's own website publishes about itself.
//
// The user pastes a link. We ask the site's robots.txt whether the page may be
// read, fetch the page once, and take what it declares in schema.org JSON-LD
// and Open Graph tags. Nothing is guessed from the page's visible text: that
// is scraping, it misread ordinary wording, and its patterns could be made to
// run for minutes. Fields the page does not declare come back in `missing` so
// the dialog can ask for them.
//
// Server-only, and the link comes from the caller, so every request is
// guarded: https only, the name is resolved once, every answer must be a
// public address, and the connection goes to that vetted address. A name that
// answers differently a moment later cannot move the connection. Redirects
// are followed by hand and each hop is checked the same way.

import "server-only";
import * as cheerio from "cheerio";
import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";

import { DESTINATION_TEXT_LIMITS, type Destination } from "../../schemas/lease";
import { USER_AGENT, USER_AGENT_TOKEN } from "../user-agent";

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
// Parsing time grows with the page, and the timeout above only covers the
// download. A listing's head and structured data fit well inside this.
export const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_ROBOTS_BYTES = 100 * 1024;
const MAX_REDIRECTS = 5;

// One message for every refusal and failure. The detail (addresses, status
// lines, header values) would tell a caller about the network this server
// sits in, so it goes to the server log only.
const FAILED_MESSAGE = "We couldn't read that link. Fill in the details by hand.";
const ROBOTS_MESSAGE =
  "That site asks automated readers not to open this page. Fill in the details by hand.";

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

export type ResolvedAddress = { address: string; family: number };
export type PageResponse = {
  status: number;
  location: string | null;
  contentType: string;
  body: string;
};

/** How names are resolved and pages fetched. Tests pass their own. */
export type Transport = {
  resolve(host: string): Promise<ResolvedAddress[]>;
  /** One GET of `url`, connected to `address` and to nothing else. */
  get(url: URL, address: ResolvedAddress, maxBytes: number): Promise<PageResponse>;
};

class Refusal extends Error {}
class RobotsRefusal extends Error {}

export async function fetchDestinationFromUrl(
  url: string,
  transport: Transport = nodeTransport,
): Promise<FetchResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { status: "fetch_failed", message: "That doesn't look like a web address." };
  }

  try {
    const { html } = await safeFetch(parsed, transport);
    const data = extractFromHtml(html, parsed.toString());
    const missing = getMissingRequired(data);
    return { status: "needs_review", data, missing };
  } catch (err) {
    if (err instanceof RobotsRefusal) return { status: "fetch_failed", message: ROBOTS_MESSAGE };
    console.error("[destination-fetch]", err instanceof Error ? err.message : err);
    return { status: "fetch_failed", message: FAILED_MESSAGE };
  }
}

export function extractFromHtml(
  html: string,
  sourceUrl?: string,
): Partial<DestinationInput> {
  const $ = cheerio.load(structuredMarkup(html));
  const ld = parseJsonLd($);
  const og = parseOgMeta($);
  // JSON-LD wins over Open Graph. Later spread wins.
  const merged: Partial<DestinationInput> = { ...og, ...ld };
  // The saved link is the address the person asked for. A page that could
  // name its own (og:url, JSON-LD url, a redirect) could point it anywhere.
  if (sourceUrl) merged.source_url = sourceUrl;
  // A page can declare text of any length. Trim it to what the form accepts.
  const L = DESTINATION_TEXT_LIMITS;
  if (merged.building_name) merged.building_name = merged.building_name.slice(0, L.name);
  if (merged.street_address) merged.street_address = merged.street_address.slice(0, L.name);
  if (merged.city) merged.city = merged.city.slice(0, L.city);
  if (merged.notes) merged.notes = merged.notes.slice(0, L.notes);
  if (merged.amenities) merged.amenities = merged.amenities.slice(0, L.amenities).map((a) => a.slice(0, L.amenity));
  if (merged.source_url && merged.source_url.length > L.url) delete merged.source_url;
  return merged;
}

const MAX_META_TAGS = 200;
const MAX_LD_SCRIPTS = 20;
const MAX_TAG_CHARS = 4096;
// Elements whose content is text, not markup. A "<meta" inside one is not a tag.
const RAW_TEXT = ["script", "style", "textarea", "title"];

/**
 * The page reduced to the only tags this reader uses: its first <meta> tags
 * and JSON-LD scripts, in a flat document. Building a tree of a whole hostile
 * page can take minutes (100,000 nested <div>s did), so the page is walked
 * once, left to right, and nothing else is kept.
 */
export function structuredMarkup(page: string): string {
  // The same bound as the download, for callers that hand in a page directly.
  const html = page.length > MAX_RESPONSE_BYTES ? page.slice(0, MAX_RESPONSE_BYTES) : page;
  const lower = html.toLowerCase();
  const kept: string[] = [];
  let metas = 0;
  let scripts = 0;
  let i = 0;
  while ((i = lower.indexOf("<", i)) !== -1) {
    if (lower.startsWith("<!--", i)) {
      const end = lower.indexOf("-->", i + 4);
      if (end === -1) break;
      i = end + 3;
      continue;
    }
    const name = ["meta", ...RAW_TEXT].find(
      (n) => lower.startsWith(n, i + 1) && /[\s/>]/.test(lower.charAt(i + 1 + n.length)),
    );
    if (!name) {
      i += 1;
      continue;
    }
    const tagEnd = endOfTag(html, i);
    if (tagEnd === -1) {
      i += 1;
      continue;
    }
    const tag = html.slice(i, tagEnd + 1);
    if (name === "meta") {
      if (metas++ < MAX_META_TAGS) kept.push(tag);
      i = tagEnd + 1;
      continue;
    }
    const close = lower.indexOf(`</${name}`, tagEnd + 1);
    if (close === -1) break;
    if (name === "script" && /application\/ld\+json/i.test(tag) && scripts++ < MAX_LD_SCRIPTS) {
      kept.push(`${tag}${html.slice(tagEnd + 1, close)}</script>`);
    }
    i = close + name.length + 2;
  }
  return `<html><head>${kept.join("\n")}</head><body></body></html>`;
}

/** Index of the `>` that closes the tag opening at `start`, skipping quoted values. -1 if it is unreasonably long or unclosed. */
function endOfTag(html: string, start: number): number {
  let quote = "";
  const limit = Math.min(html.length, start + MAX_TAG_CHARS);
  for (let j = start + 1; j < limit; j++) {
    const c = html[j];
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ">") return j;
  }
  return -1;
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

  // numberOfRooms counts every room, so it is only a fallback.
  const beds = coerceNumber(item.numberOfBedrooms) ?? coerceNumber(item.numberOfRooms);
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

function coerceNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// ---------- address guard ----------

// Everything that is not a public unicast address.
const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 3],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
// A cloud platform's internal service address that sits in public space.
blocked.addAddress("168.63.129.16", "ipv4");
for (const [net, prefix] of [
  ["::", 96], // unspecified, loopback and the old IPv4-compatible form (::127.0.0.1)
  ["64:ff9b::", 96],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

// IPv4-mapped IPv6 is refused whole: a public site never needs it, and it is
// one more way to spell 127.0.0.1. It has its own list because BlockList also
// matches this rule against plain IPv4 addresses, which would refuse them all.
const mapped = new BlockList();
mapped.addSubnet("::ffff:0:0", 96, "ipv6");

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  if (family === 6 && mapped.check(address, "ipv6")) return false;
  return !blocked.check(address, family === 6 ? "ipv6" : "ipv4");
}

/** The one address a request to `host` may connect to, or a Refusal. */
async function vetHost(host: string, transport: Transport): Promise<ResolvedAddress> {
  // URL keeps the brackets on an IPv6 literal.
  const bare = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  const literal = isIP(bare);
  const records = literal ? [{ address: bare, family: literal }] : await transport.resolve(bare);
  if (records.length === 0) throw new Refusal(`${bare} did not resolve`);
  // One private answer among public ones is enough to refuse: which answer a
  // connection would pick is not ours to rely on.
  for (const r of records) {
    if (!isPublicAddress(r.address)) throw new Refusal(`${bare} resolves to a non-public address ${r.address}`);
  }
  return records[0];
}

function assertAllowedUrl(u: URL): void {
  if (u.protocol !== "https:") throw new Refusal(`protocol ${u.protocol} is not https`);
  if (u.port && u.port !== "443") throw new Refusal(`port ${u.port} is not 443`);
  if (u.username || u.password) throw new Refusal("the link carries credentials");
}

// ---------- robots.txt ----------

type RobotsRule = { allow: boolean; pattern: string };

/**
 * The rules that apply to us in a robots.txt: the group naming this reader if
 * there is one, else the `*` group. Bounded, because the file is the site's.
 */
export function parseRobots(text: string): RobotsRule[] {
  const groups: { agents: string[]; rules: RobotsRule[] }[] = [];
  let current: { agents: string[]; rules: RobotsRule[] } | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/).slice(0, 5000)) {
    const hash = rawLine.indexOf("#");
    const line = (hash === -1 ? rawLine : rawLine.slice(0, hash)).trim();
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((field === "allow" || field === "disallow") && current) {
      lastWasAgent = false;
      // An empty Disallow means "nothing is disallowed".
      if (value && value.length <= 200 && current.rules.length < 300) {
        current.rules.push({ allow: field === "allow", pattern: value });
      }
    } else {
      lastWasAgent = false;
    }
  }
  const named = groups.filter((g) => g.agents.includes(USER_AGENT_TOKEN.toLowerCase()));
  const chosen = named.length > 0 ? named : groups.filter((g) => g.agents.includes("*"));
  return chosen.flatMap((g) => g.rules);
}

// `*` matches any run of characters and a trailing `$` anchors the end.
// Written as a scan with one backtrack point, so a hostile pattern cannot make
// it rescan the way a regular expression built from it could.
function robotsPatternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const pat = anchored ? pattern.slice(0, -1) : pattern;
  let p = 0;
  let s = 0;
  let star = -1;
  let mark = 0;
  while (s < path.length) {
    if (p < pat.length && pat[p] === "*") {
      star = p++;
      mark = s;
    } else if (p < pat.length && pat[p] === path[s]) {
      p++;
      s++;
    } else if (p === pat.length && !anchored) {
      return true;
    } else if (star !== -1) {
      p = star + 1;
      s = ++mark;
    } else {
      return false;
    }
  }
  while (p < pat.length && pat[p] === "*") p++;
  return p === pat.length;
}

/** The longest matching rule decides, and Allow wins a tie. No match means allowed. */
export function robotsAllows(rules: RobotsRule[], pathAndQuery: string): boolean {
  let best: RobotsRule | null = null;
  for (const rule of rules) {
    if (!robotsPatternMatches(rule.pattern, pathAndQuery)) continue;
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow)
    ) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}

async function assertRobotsAllow(page: URL, address: ResolvedAddress, transport: Transport): Promise<void> {
  let robotsUrl = new URL("/robots.txt", page);
  let at = address;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await transport.get(robotsUrl, at, MAX_ROBOTS_BYTES);
    if (res.status >= 300 && res.status < 400 && res.location) {
      robotsUrl = new URL(res.location, robotsUrl);
      assertAllowedUrl(robotsUrl);
      at = await vetHost(robotsUrl.hostname, transport);
      continue;
    }
    // No robots.txt means no rules. A server error means we cannot know, and
    // the standard says to treat that as "do not read".
    if (res.status >= 400 && res.status < 500) return;
    if (res.status < 200 || res.status >= 300) {
      throw new RobotsRefusal(`robots.txt answered ${res.status}`);
    }
    if (!robotsAllows(parseRobots(res.body), page.pathname + page.search)) {
      throw new RobotsRefusal(`robots.txt disallows ${page.pathname}`);
    }
    return;
  }
  throw new RobotsRefusal("robots.txt redirects too many times");
}

// ---------- fetch ----------

async function safeFetch(
  initialUrl: URL,
  transport: Transport,
): Promise<{ html: string; finalUrl: string }> {
  let current = initialUrl;
  // Each request has its own timeout. This bounds the whole chain of hops.
  const deadline = Date.now() + 2 * FETCH_TIMEOUT_MS;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (Date.now() > deadline) throw new Refusal("the link took too long to follow");
    assertAllowedUrl(current);
    const address = await vetHost(current.hostname, transport);
    await assertRobotsAllow(current, address, transport);

    const res = await transport.get(current, address, MAX_RESPONSE_BYTES);

    if (res.status >= 300 && res.status < 400) {
      if (!res.location) throw new Refusal(`redirect ${res.status} without a location`);
      current = new URL(res.location, current);
      continue;
    }
    if (res.status < 200 || res.status >= 300) throw new Refusal(`the page answered ${res.status}`);
    if (!/^(text\/html|application\/xhtml\+xml)/i.test(res.contentType)) {
      throw new Refusal(`unexpected content type ${res.contentType || "(none)"}`);
    }
    return { html: res.body, finalUrl: current.toString() };
  }
  throw new Refusal(`more than ${MAX_REDIRECTS} redirects`);
}

/**
 * One GET whose connection goes to `address`, whatever the name in `url`
 * resolves to at that moment. The name is still sent for TLS and the Host
 * header, so the certificate is checked against it. Never follows redirects.
 */
export function pinnedGet(url: URL, address: ResolvedAddress, maxBytes: number): Promise<PageResponse> {
  return new Promise((resolve, reject) => {
    const request = url.protocol === "https:" ? httpsRequest : httpRequest;
    const req = request(
      url,
      {
        method: "GET",
        agent: false,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { Accept: "text/html, application/xhtml+xml, text/plain", "User-Agent": USER_AGENT },
        // Node asks this instead of the system resolver, in either of two shapes.
        lookup: (_host, options, callback) => {
          if (typeof options === "object" && options.all) callback(null, [address]);
          else callback(null, address.address, address.family);
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let total = 0;
        res.on("data", (chunk: Buffer) => {
          total += chunk.byteLength;
          if (total > maxBytes) {
            reject(new Error(`the response is larger than ${maxBytes} bytes`));
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () => {
          const header = (name: string) => {
            const v = res.headers[name];
            return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
          };
          resolve({
            status: res.statusCode ?? 0,
            location: header("location"),
            contentType: header("content-type") ?? "",
            body: new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks)),
          });
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

const nodeTransport: Transport = {
  resolve: (host) => dnsLookup(host, { all: true }),
  get: pinnedGet,
};
