import { NextResponse, type NextRequest } from "next/server";

// Demo mode only: give each visitor an anonymous id so the in-memory demo data
// (lib/supabase/demo-client.ts) is per visitor. The id is set on the incoming
// request too, so the first page load already reads and writes its own copy.
const DEMO_VISITOR_COOKIE = "reloca_demo_visitor";
const VISITOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function middleware(req: NextRequest) {
  const current = req.cookies.get(DEMO_VISITOR_COOKIE)?.value;
  if (process.env.RELOCA_DEMO_MODE !== "1" || (current && VISITOR_ID.test(current))) {
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
