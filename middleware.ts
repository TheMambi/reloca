import { NextResponse, type NextRequest } from "next/server";
import { appMode } from "@/lib/mode";
import properties from "@/data/properties.json";
import { toSlug } from "@/lib/data/neighborhood-slug";
import { clientKey, createRateLimiter } from "@/lib/rate-limit";
import { contentSecurityPolicy } from "@/lib/security-headers";

// Demo mode only: give each visitor an anonymous id so the in-memory demo data
// (lib/supabase/demo-client.ts) is per visitor. The id is set on the incoming
// request too, so the first page load already reads and writes its own copy.
const DEMO_VISITOR_COOKIE = "reloca_demo_visitor";
const VISITOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The neighborhoods that have a page. Pages start sending their loading screen
// before they run, so a notFound() inside the page arrives after the status
// line and the visitor gets 200. An unknown neighborhood is turned away here
// instead, where the status can still be 404.
const NEIGHBORHOOD_SLUGS = new Set(properties.map((p) => toSlug(p.neighborhood)));
const NEIGHBORHOOD_PATH = /^\/properties\/([^/]+)\/?$/;

// Every form save and button in the app is a POST with this header. Thirty a
// minute is far above what a person does by hand and far below a script.
// lib/rate-limit.ts says what an in-memory count can and cannot promise.
const actionLimiter = createRateLimiter(30, 60_000);

export function middleware(req: NextRequest) {
  // Asked first: while the mode is unset or invalid this throws, so no page or
  // server action is served.
  const demo = appMode() === "demo";
  if (req.method === "POST" && req.headers.has("next-action") && !actionLimiter.allow(clientKey(req.headers))) {
    return new NextResponse("Too many requests. Wait a minute and try again.", {
      status: 429,
      headers: { "Retry-After": "60" },
    });
  }
  // Next reads the nonce from this header on the request and puts it on the
  // scripts it writes into the page. The browser gets the same policy back.
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV !== "production");
  req.headers.set("x-nonce", nonce);
  req.headers.set("content-security-policy", csp);

  const segment = NEIGHBORHOOD_PATH.exec(req.nextUrl.pathname)?.[1];
  if (segment !== undefined && !NEIGHBORHOOD_SLUGS.has(segment)) {
    // No route matches this address, so Next answers with the 404 page.
    const notFound = NextResponse.rewrite(new URL("/_unknown-neighborhood", req.url), {
      status: 404,
      request: { headers: req.headers },
    });
    notFound.headers.set("Content-Security-Policy", csp);
    return notFound;
  }
  const current = req.cookies.get(DEMO_VISITOR_COOKIE)?.value;
  // Only a page view starts a visitor. A browser has loaded a page before it
  // posts anything, so a post that arrives with no id is a script, and giving
  // each one a new id would let it push real visitors' copies out of memory.
  const pageView = req.method === "GET" || req.method === "HEAD";
  const id = !demo || !pageView || (current && VISITOR_ID.test(current)) ? null : crypto.randomUUID();
  if (id) req.cookies.set(DEMO_VISITOR_COOKIE, id);
  const res = NextResponse.next({ request: { headers: req.headers } });
  res.headers.set("Content-Security-Policy", csp);
  if (!id) return res;
  res.cookies.set(DEMO_VISITOR_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    // Plain-http localhost would drop a secure cookie in some browsers.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  return res;
}

export const config = {
  // Skips only what is served as a file. A dot elsewhere in an address must
  // not skip the visitor id, the policy header or the rate limit. The second
  // entry covers neighborhood addresses that end like an image file.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|maplibre-gl-worker.mjs|.*\\.(?:png|svg|ico)$).*)",
    "/properties/:neighborhood",
  ],
};
