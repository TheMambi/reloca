import type { AppMode } from "./mode";

/** Where the map's background tiles come from (lib/maplibre.ts). */
const MAP_TILES = "https://basemaps.cartocdn.com";

/**
 * Headers for every response, set in next.config.ts. A private copy holds a
 * real address, lease and policy numbers, so it also tells crawlers to keep
 * out. The demo is sample data and stays open to them.
 */
export function securityHeaders(mode: AppMode): { key: string; value: string }[] {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    ...(mode === "demo" ? [] : [{ key: "X-Robots-Tag", value: "noindex, nofollow" }]),
  ];
}

/**
 * The Content-Security-Policy for one page response. Next writes small inline
 * scripts into every page, so scripts are allowed by a nonce that changes on
 * each request (the middleware makes it) instead of by 'unsafe-inline'.
 *
 * Styles do allow 'unsafe-inline': React, the charts and the map position
 * things with style attributes. The map also draws from blob: images and runs
 * a worker, and reads its tiles from one outside host.
 */
export function contentSecurityPolicy(nonce: string, dev: boolean): string {
  return [
    "default-src 'self'",
    // The dev server evaluates code for hot reload. A build never does.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${MAP_TILES}`,
    "font-src 'self'",
    `connect-src 'self' ${MAP_TILES}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** The robots setting for the page metadata and /robots.txt. */
export function allowsIndexing(mode: AppMode): boolean {
  return mode === "demo";
}
