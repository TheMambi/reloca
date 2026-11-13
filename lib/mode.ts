import { z } from "zod";

/**
 * Which data this server works on: "demo" is fictional sample data held in
 * memory, "private" is the owner's own database. There is no default. An unset
 * or mistyped mode stops the app instead of quietly choosing the database.
 */
export type AppMode = "demo" | "private";

const ModeEnv = z.object({
  RELOCA_MODE: z.enum(["demo", "private"]).optional(),
});

// Private mode cannot run without these. The app has no sign-in of its own, so
// RELOCA_ACCESS_GATE makes whoever deploys it name what keeps strangers out.
const PrivateEnv = z.object({
  RELOCA_ACCESS_GATE: z.string().trim().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  RELOCA_SINGLE_USER_ID: z.string().min(1),
});

type Env = Record<string, string | undefined>;

const REFUSED = "Reloca refuses to serve:";

/**
 * Decides the mode from the given variables, or throws an error that says what
 * to fix. Messages name variables only and never include a value.
 */
export function resolveMode(env: Env): AppMode {
  const parsed = ModeEnv.safeParse({ RELOCA_MODE: env.RELOCA_MODE || undefined });
  // The older way to ask for the demo. Demos deployed before RELOCA_MODE still set it.
  const legacyDemo = env.RELOCA_DEMO_MODE === "1";
  const mode = parsed.success ? (parsed.data.RELOCA_MODE ?? (legacyDemo ? "demo" : undefined)) : undefined;

  if (!mode) {
    throw new Error(
      `${REFUSED} no valid mode is set. Set RELOCA_MODE to "demo" (sample data, no database) ` +
        `or "private" (your own database). The older RELOCA_DEMO_MODE only counts when it is exactly "1".`,
    );
  }
  if (mode === "demo") return "demo";

  if (legacyDemo) {
    throw new Error(`${REFUSED} RELOCA_MODE=private and RELOCA_DEMO_MODE=1 disagree. Remove one of them.`);
  }
  const required = PrivateEnv.safeParse(env);
  if (!required.success) {
    const names = [...new Set(required.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(
      `${REFUSED} private mode is missing ${names.join(", ")}. See .env.template for what each one is.`,
    );
  }
  return "private";
}

let resolved: AppMode | undefined;

/**
 * The mode of this server. A valid answer is kept for the life of the process.
 * While the settings are wrong, every call throws.
 */
export function appMode(): AppMode {
  // Named reads only: they work in every Next runtime, including middleware.
  return (resolved ??= resolveMode({
    RELOCA_MODE: process.env.RELOCA_MODE,
    RELOCA_DEMO_MODE: process.env.RELOCA_DEMO_MODE,
    RELOCA_ACCESS_GATE: process.env.RELOCA_ACCESS_GATE,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    RELOCA_SINGLE_USER_ID: process.env.RELOCA_SINGLE_USER_ID,
  }));
}
