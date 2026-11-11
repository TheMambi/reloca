import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { WalkabilityProfileSchema } from "@/schemas";
import type { WalkabilityProfile } from "@/schemas";

/** Friendly labels for the walkability category enum (no kebab-case in the UI). */
export const WALKABILITY_LABELS: Record<WalkabilityProfile["category"], string> =
  {
    "car-dependent": "Car-dependent",
    "somewhat-walkable": "Somewhat walkable",
    "very-walkable": "Very walkable",
    "walker-paradise": "Walker's paradise",
  };

const cache = new Map<string, WalkabilityProfile | null>();

/**
 * Load the derived OSM walkability profile for a city slug, or null when the
 * city has no profile yet. Written by `scripts/ingest-city.ts` (Phase 8 Wave B).
 */
export function getWalkabilityProfile(slug: string): WalkabilityProfile | null {
  if (cache.has(slug)) return cache.get(slug) ?? null;
  const path = join(process.cwd(), `data/walkability/${slug}.json`);
  if (!existsSync(path)) {
    cache.set(slug, null);
    return null;
  }
  const parsed = WalkabilityProfileSchema.parse(
    JSON.parse(readFileSync(path, "utf-8")),
  );
  cache.set(slug, parsed);
  return parsed;
}
