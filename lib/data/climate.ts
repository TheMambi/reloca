import { existsSync, readFileSync } from "fs";
import { MissingCityDataError } from "./missing-city-data";
import { join } from "path";
import { ClimateProfileSchema } from "@/schemas";
import type { ClimateProfile } from "@/schemas";

const cache = new Map<string, ClimateProfile>();

/**
 * Load climate profile for any city slug in the registry (the file lives at
 * `data/climate/<slug>.json`). Slug-generic since Phase 8 Wave C — any origin or
 * destination in a relocation resolves here, not just denver/long-beach.
 */
export function getClimateProfile(slug: string): ClimateProfile {
  const existing = cache.get(slug);
  if (existing) return existing;
  const path = join(process.cwd(), `data/climate/${slug}.json`);
  if (!existsSync(path)) {
    throw new MissingCityDataError(`No climate data for city "${slug}" (expected ${path})`);
  }
  const parsed = ClimateProfileSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
  cache.set(slug, parsed);
  return parsed;
}

/** Load both climate profiles for side-by-side comparison. */
export function getAllClimateProfiles(): { denver: ClimateProfile; longBeach: ClimateProfile } {
  return {
    denver: getClimateProfile("denver"),
    longBeach: getClimateProfile("long-beach"),
  };
}
