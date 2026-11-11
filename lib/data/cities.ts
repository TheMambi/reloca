import { readFileSync } from "fs";
import { join } from "path";
import { CitiesFileSchema } from "@/schemas";
import type { City } from "@/schemas";

let cached: City[] | null = null;

/** The city pool. Static, version-controlled reference data (AD-029). */
export function getCities(): City[] {
  if (cached) return cached;
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), "data/cities.json"), "utf-8"),
  );
  cached = CitiesFileSchema.parse(raw);
  return cached;
}

/** Look up a city by slug, or undefined if it isn't in the pool. */
export function getCity(slug: string): City | undefined {
  return getCities().find((c) => c.slug === slug);
}

/** Friendly display name for a slug ("Long Beach"), falling back to the slug. */
export function cityName(slug: string): string {
  return getCity(slug)?.displayName ?? slug;
}

/** 3-letter mono route code ("LGB"), falling back to the upper-cased slug head. */
export function cityCode(slug: string): string {
  return getCity(slug)?.routeCode ?? slug.slice(0, 3).toUpperCase();
}

/** Reverse lookup: a display name ("Long Beach") → its slug, or undefined. */
export function citySlugFromName(displayName: string): string | undefined {
  return getCities().find((c) => c.displayName === displayName)?.slug;
}
