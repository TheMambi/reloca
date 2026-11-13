// Runs every *.test.ts as a plain tsx script from the repo root and stops at the first failure.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const tsx = require.resolve("tsx/cli");
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const skipped = new Set(["node_modules", "Inspiration"]);

function findTests(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skipped.has(entry.name) || entry.name.startsWith(".")) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findTests(path));
    else if (entry.name.endsWith(".test.ts")) found.push(path);
  }
  return found;
}

const files = findTests(root).sort();
// An empty suite must not count as a pass.
if (files.length === 0) {
  console.error("No *.test.ts files found.");
  process.exit(1);
}

for (const file of files) {
  const name = relative(root, file);
  // Some tests read data/ through process.cwd(), so each one starts in the repo root.
  const result = spawnSync(process.execPath, [tsx, name], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`FAILED ${name}`);
    process.exit(result.status ?? 1);
  }
}
console.log(`${files.length} test files passed.`);
