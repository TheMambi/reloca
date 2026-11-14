import { NextResponse, type NextRequest } from "next/server";
import { appMode } from "@/lib/mode";
import properties from "@/data/properties.json";
import { toSlug } from "@/lib/data/neighborhood-slug";

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

export function middleware(req: NextRequest) {
  // Asked first: while the mode is unset or invalid this throws, so no page or
  // server action is served.
  const demo = appMode() === "demo";
  const segment = NEIGHBORHOOD_PATH.exec(req.nextUrl.pathname)?.[1];
  if (segment !== undefined && !NEIGHBORHOOD_SLUGS.has(segment)) {
    // No route matches this address, so Next answers with the 404 page.
    return NextResponse.rewrite(new URL("/_unknown-neighborhood", req.url), { status: 404 });
  }
  const current = req.cookies.get(DEMO_VISITOR_COOKIE)?.value;
  if (!demo || (current && VISITOR_ID.test(current))) {
    return NextResponse.next();
  }
  const id = crypto.randomUUID();
  req.cookies.set(DEMO_VISITOR_COOKIE, id);
  const res = NextResponse.next({ request: { headers: req.headers } });
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
  // The second entry covers neighborhood addresses that contain a dot, which
  // the first one skips as if they were files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)", "/properties/:neighborhood"],
};
