// Run: npx tsx scripts/keepalive.test.ts
//
// Runs a copy of keepalive.sh against a stand-in `curl`, so nothing is contacted.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Stand-in values built at run time.
const KEY = `service-${"x".repeat(12)}`;
const URL = "http://127.0.0.1:54321";

const dir = mkdtempSync(join(tmpdir(), "keepalive-"));
mkdirSync(join(dir, "scripts"));
mkdirSync(join(dir, "bin"));
copyFileSync(join(process.cwd(), "scripts/keepalive.sh"), join(dir, "scripts/keepalive.sh"));
// Records what it was given, then answers the way the test asks.
writeFileSync(
  join(dir, "bin/curl"),
  '#!/usr/bin/env bash\nprintf "%s\\n" "$@" > "$CURL_ARGS"\ncat > "$CURL_STDIN"\nprintf "%s" "$CURL_STATUS"\nexit "$CURL_EXIT"\n',
);
chmodSync(join(dir, "bin/curl"), 0o755);

function ping(envFile: string, status: string, exit: number) {
  writeFileSync(join(dir, ".env.local"), envFile);
  const result = spawnSync("bash", [join(dir, "scripts/keepalive.sh")], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${join(dir, "bin")}:${process.env.PATH}`,
      CURL_ARGS: join(dir, "args"),
      CURL_STDIN: join(dir, "stdin"),
      CURL_STATUS: status,
      CURL_EXIT: String(exit),
    },
  });
  return { code: result.status, output: result.stdout + result.stderr };
}

try {
  // A healthy project. The key reaches curl on stdin only, and nothing prints it or the address.
  const alive = ping(`SUPABASE_URL=${URL}\nSUPABASE_SERVICE_ROLE_KEY=${KEY}\n`, "200", 0);
  assert.equal(alive.code, 0, alive.output);
  assert.match(alive.output, /project is alive/);
  assert.ok(!readFileSync(join(dir, "args"), "utf8").includes(KEY), "the key must not be a curl argument");
  assert.ok(!alive.output.includes(KEY) && !alive.output.includes(URL), "the output must not show the key or the address");
  const sent = readFileSync(join(dir, "stdin"), "utf8");
  assert.ok(sent.includes(`apikey: ${KEY}`) && sent.includes(`${URL}/rest/v1/`), "curl reads the request from stdin");

  // The older name for the address still works.
  assert.equal(ping(`NEXT_PUBLIC_SUPABASE_URL=${URL}\nSUPABASE_SERVICE_ROLE_KEY=${KEY}\n`, "200", 0).code, 0);

  // A paused project does not resolve: curl prints 000 and fails. The script must still explain.
  const paused = ping(`SUPABASE_URL=${URL}\nSUPABASE_SERVICE_ROLE_KEY=${KEY}\n`, "000", 6);
  assert.equal(paused.code, 1, paused.output);
  assert.match(paused.output, /likely paused/);

  // A refused key is a failure, not a silent pass.
  assert.equal(ping(`SUPABASE_URL=${URL}\nSUPABASE_SERVICE_ROLE_KEY=${KEY}\n`, "401", 0).code, 1);

  // A missing setting is named instead of ending the script with no message.
  const missing = ping(`SUPABASE_URL=${URL}\n`, "200", 0);
  assert.equal(missing.code, 1);
  assert.match(missing.output, /Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/);
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log("scripts/keepalive.test.ts passed");
