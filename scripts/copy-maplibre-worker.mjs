// Copies MapLibre's worker into public/ so the app can serve it (see lib/maplibre.ts).
import { copyFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve("maplibre-gl/package.json"));
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

copyFileSync(
  join(pkgDir, "dist", "maplibre-gl-worker.mjs"),
  join(root, "public", "maplibre-gl-worker.mjs"),
);
