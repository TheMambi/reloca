// Guards for what reaches the screen: no text below the 11px floor, no
// countdown shorthand, no data-file slugs, and no animation without keyframes.
// Run: npx tsx lib/screen-text.test.ts

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { crimeSubcategoryLabel } from "@/schemas/crime";

const root = process.cwd();

function sources(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.(tsx?|css)$/.test(entry.name) && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

const files = [...sources("app"), ...sources("components")];
assert.ok(files.length > 50, "expected to find the app's source files");

// 1. The floor. Text utilities win over .label-cap, so the floor only holds
// if no utility below 11px exists.
for (const file of files) {
  const text = readFileSync(join(root, file), "utf8");
  for (const match of text.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
    assert.ok(Number(match[1]) >= 11, `${file} uses ${match[0]}; the smallest text size is 11px`);
  }
}

// 2. Countdown shorthand. Comments may still describe the old forms.
const SHORTHAND = /T-\$\{|["'`>]T-\d|T-MINUS|["'`]T\+["'`]|T-—|\+\$\{[^}]*\}d\b/;
for (const file of [...files, ...sources("lib")]) {
  if (!/\.tsx?$/.test(file)) continue;
  readFileSync(join(root, file), "utf8")
    .split("\n")
    .forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, "").replace(/\{\/\*.*?\*\/\}/g, "");
      if (/^\s*(\*|\/\*)/.test(code)) return;
      assert.ok(!SHORTHAND.test(code), `${file}:${i + 1} prints countdown shorthand: ${line.trim()}`);
    });
}

// 3. Every crime subcategory in the data files has words for a label.
const crimeDir = join(root, "data/crime");
let subcategories = 0;
for (const name of readdirSync(crimeDir)) {
  if (!name.endsWith(".json")) continue;
  const text = readFileSync(join(crimeDir, name), "utf8");
  for (const match of text.matchAll(/"subcategory":\s*"([^"]+)"/g)) {
    subcategories += 1;
    const label = crimeSubcategoryLabel(match[1]);
    assert.ok(/^[A-Z][a-z]+( [a-z]+)*$/.test(label), `"${match[1]}" shows as "${label}"`);
  }
}
assert.ok(subcategories > 0, "expected crime subcategories in data/crime");
assert.equal(crimeSubcategoryLabel("identity-theft"), "Identity theft");

// 4. Starter task titles read as sentences and name no fixed city.
const seed: { title: string }[] = JSON.parse(
  readFileSync(join(root, "data/checklist-seed.json"), "utf8"),
);
for (const { title } of seed) {
  assert.ok(!/[+·→]|STATUTORY|Denver|Long Beach|Sacramento/.test(title), `starter task title: ${title}`);
}

// 5. An animation name without keyframes leaves its element still (the hero
// plane did not move for this reason).
const css = readFileSync(join(root, "app/globals.css"), "utf8");
const defined = new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]));
for (const match of css.matchAll(/animation:\s*([\w-]+)\s/g)) {
  assert.ok(defined.has(match[1]), `animation "${match[1]}" has no @keyframes in app/globals.css`);
}
for (const file of files) {
  const text = readFileSync(join(root, file), "utf8");
  for (const match of text.matchAll(/animation:\s*["'`]([\w-]+)\s/g)) {
    assert.ok(defined.has(match[1]), `${file} names animation "${match[1]}" with no @keyframes`);
  }
  assert.ok(!/<animate\b/.test(text), `${file} uses an SVG <animate>, which ignores the reduced-motion setting`);
}

console.log("lib/screen-text.test.ts: all assertions passed");
