import "server-only";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { connection } from "next/server";
import { appMode, supabaseUrl } from "@/lib/mode";
import type { Database } from "./types";
import { createDemoClient } from "./demo-client";
import { DEMO_USER_ID } from "./demo-seed";

type AppClient = ReturnType<typeof createPlainClient<Database>>;

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
 * Database client for Server Components, route handlers and server actions.
 *
 * In private mode it carries the service-role key, which skips row level
 * security, so the database filters nothing for us. Every query on a table
 * must carry `.eq("user_id", requireUserId())`, and every insert must set
 * `user_id`. lib/supabase/user-scope.test.ts fails any query that does not.
 */
export async function createClient(): Promise<AppClient> {
  // Built first: it throws while the mode is unset or invalid.
  const client = createAdminClient();
  // Keeps every page request-time rendered. Without it the build would
  // prerender pages, and in private mode bake database rows into static files.
  await connection();
  return client;
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
 * The same client without the request-time marker, for helpers that run
 * inside a request another call has already marked. The service-role key is a
 * server secret: this module is server-only, and the key must never sit
 * behind a NEXT_PUBLIC_ name. The same user_id rule applies to every query.
 */
export function createAdminClient(): AppClient {
  if (isDemoMode()) {
    return createDemoClient() as unknown as AppClient;
  }
  return createPlainClient<Database>(
    supabaseUrl({
      SUPABASE_URL: process.env.SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    })!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
