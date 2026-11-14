// Starts the production build in demo mode and asks for every page once.
// Run `pnpm build` first (with RELOCA_MODE=demo), then `pnpm smoke`.
// It catches a page that stops rendering, which the unit tests cannot see.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const next = createRequire(import.meta.url).resolve("next/dist/bin/next");

const pages = [
  "/",
  "/cost-of-living",
  "/properties",
  "/properties?tab=compare",
  "/properties/belmont-shore",
  "/lease",
  "/lease?tab=forecast",
  "/transitions",
  "/moving-cost",
  "/checklist",
  "/community",
];
// Sentences the error screens show. None may appear on a healthy page.
const errorText = [/Something went wrong/i, /A saved record is damaged/i, /couldn(?:'|&#x27;)t be loaded/i];

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitUntilUp(base, server) {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error("The server stopped before it answered. Was the app built?");
    try {
      await fetch(base + "/robots.txt");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error("The server did not answer within 20 seconds.");
}

const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [next, "start", "-p", String(port), "-H", "127.0.0.1"], {
  cwd: root,
  stdio: ["ignore", "ignore", "inherit"],
  env: { ...process.env, RELOCA_MODE: "demo" },
});

const failures = [];
try {
  await waitUntilUp(base, server);
  for (const page of pages) {
    const res = await fetch(base + page);
    const html = await res.text();
    const problems = [];
    if (res.status !== 200) problems.push(`answered ${res.status}`);
    if (!/<h1[\s>]/.test(html)) problems.push("has no main heading");
    if (!res.headers.get("content-security-policy")) problems.push("was sent without a content security policy");
    for (const pattern of errorText) if (pattern.test(html)) problems.push(`shows an error screen (${pattern.source})`);
    if (problems.length > 0) failures.push(`${page} ${problems.join(", ")}`);
    else console.log(`ok   ${page}`);
  }
  const missing = await fetch(base + "/properties/no-such-neighborhood");
  if (missing.status !== 404) failures.push(`an unknown neighborhood answered ${missing.status}, expected 404`);
  else console.log("ok   an unknown neighborhood answers 404");
} catch (err) {
  failures.push(err instanceof Error ? err.message : String(err));
} finally {
  server.kill();
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}
console.log(`${pages.length} pages rendered.`);
