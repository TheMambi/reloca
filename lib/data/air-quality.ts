import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { AirQualityProfileSchema } from "@/schemas";
import type { AirQualityProfile } from "@/schemas";

const cache = new Map<string, AirQualityProfile | null>();

/**
 * Load the ingested EPA AirNow snapshot for a city slug, or null when the city
 * has no snapshot yet (a city can join the pool before ingestion has run). The
 * snapshot is written by `scripts/ingest-city.ts` (Phase 8 Wave B).
 */
export function getAirQualityProfile(slug: string): AirQualityProfile | null {
  if (cache.has(slug)) return cache.get(slug) ?? null;
  const path = join(process.cwd(), `data/air-quality/${slug}.json`);
  if (!existsSync(path)) {
    cache.set(slug, null);
    return null;
  }
  const parsed = AirQualityProfileSchema.parse(
    JSON.parse(readFileSync(path, "utf-8")),
  );
  cache.set(slug, parsed);
  return parsed;
}
