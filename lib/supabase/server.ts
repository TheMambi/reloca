import { createServerClient } from "@supabase/ssr";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { appMode } from "@/lib/mode";
import type { Database } from "./types";
import { createDemoClient } from "./demo-client";
import { DEMO_USER_ID } from "./demo-seed";

type AppClient = ReturnType<typeof createServerClient<Database>>;

/**
 * Public portfolio deploy: no database, sample data held in memory.
 * Throws while the mode is unset or invalid (lib/mode.ts). Every client and
 * user-id helper below asks this first, so none of them can reach the
 * database by accident.
 */
export function isDemoMode(): boolean {
  return appMode() === "demo";
}

/**
 * Server-side Supabase client for Server Components, route handlers,
 * and server actions. Cookie wiring is in place for v2 auth migration —
 * v1 has no auth, so the cookie store is effectively unused.
 */
export async function createClient(): Promise<AppClient> {
  if (isDemoMode()) {
    // The real client reads cookies, which keeps every page request-time
    // rendered. The demo must stay that way too, or the build tries to
    // prerender pages whose layout reads search params.
    await connection();
    return createDemoClient() as unknown as AppClient;
  }
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component context — cookie writes are no-ops here.
            // Auth refresh would be handled by middleware once v2 adds Supabase Auth.
          }
        },
      },
    },
  );
}

/**
 * The single-user UUID, loudly. `process.env.RELOCA_SINGLE_USER_ID!` sites
 * used to silently attempt `user_id: undefined` writes when the env var was
 * missing; this throws with an actionable message instead (Wave 2, AD-040).
 * Call lazily inside actions/loaders — never at module scope, so pure-logic
 * test scripts can import these modules without the env configured.
 */
export function requireUserId(): string {
  if (isDemoMode()) return DEMO_USER_ID;
  const id = process.env.RELOCA_SINGLE_USER_ID;
  if (!id) throw new Error("RELOCA_SINGLE_USER_ID env var missing");
  return id;
}

/**
 * Friendly action-error helper (Wave 2, AD-040): raw Supabase/Postgres error
 * strings used to be returned in action payloads and rendered verbatim in the
 * UI — leaking table/constraint names and violating the user-facing copy
 * rule. Log the raw error server-side; hand the UI clean English.
 */
export function friendlyDbError(
  context: string,
  error: { message?: string | null } | null | undefined,
): string {
  console.error(`[action] ${context}:`, error?.message ?? error);
  return "Something went wrong — please try again.";
}

/**
 * Admin client — uses the service-role key and bypasses RLS.
 * SERVER ONLY. Used for the first-run seeder that must insert under the
 * single-user UUID before any policy-authorized session exists.
 */
export function createAdminClient() {
  if (isDemoMode()) {
    return createDemoClient() as unknown as ReturnType<typeof createPlainClient<Database>>;
  }
  return createPlainClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
