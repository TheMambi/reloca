// Run: npx tsx --conditions=react-server lib/supabase/server.test.ts
import assert from "node:assert/strict";
import { DEMO_USER_ID } from "./demo-seed";
import { createAdminClient, createClient, isDemoMode, requireUserId } from "./server";

const MODE_VARS = [
  "RELOCA_MODE",
  "RELOCA_DEMO_MODE",
  "RELOCA_ACCESS_GATE",
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RELOCA_SINGLE_USER_ID",
];

function setEnv(values: Record<string, string>) {
  for (const name of MODE_VARS) delete process.env[name];
  Object.assign(process.env, values);
}

// Stand-in values built at run time. The address is local and nothing connects to it.
const filler = (label: string) => `${label}-${"x".repeat(12)}`;
const database = {
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY: filler("service"),
  RELOCA_SINGLE_USER_ID: filler("user"),
};

async function main() {
  const refused = { message: /^Reloca refuses to serve:/ };

  // With the database settings present but no valid mode, these helpers used to
  // hand back a live database client and the single user id. Now each one refuses.
  const invalid: Record<string, string>[] = [
    {},
    database,
    { ...database, RELOCA_DEMO_MODE: "true" },
    { ...database, RELOCA_MODE: "privat" },
    { ...database, RELOCA_MODE: "private" }, // no access gate named
  ];
  for (const env of invalid) {
    setEnv(env);
    assert.throws(() => isDemoMode(), refused);
    assert.throws(() => requireUserId(), refused);
    assert.throws(() => createAdminClient(), refused);
    await assert.rejects(() => createClient(), refused);
  }

  // The older demo flag still selects the demo, which never needs the database.
  setEnv({ RELOCA_DEMO_MODE: "1" });
  assert.equal(isDemoMode(), true);
  assert.equal(requireUserId(), DEMO_USER_ID);

  console.log("lib/supabase/server.test.ts passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
