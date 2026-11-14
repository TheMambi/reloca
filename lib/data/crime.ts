import { existsSync, readFileSync } from "fs";
import { MissingCityDataError } from "./missing-city-data";
import { join } from "path";
import { CrimeRecordSchema } from "@/schemas";
import type { CrimeRecord } from "@/schemas";

const cache = new Map<string, CrimeRecord>();

/**
 * Load crime data for any city slug in the registry (the file lives at
 * `data/crime/<slug>.json`). Slug-generic since Phase 8 Wave C — any origin or
 * destination in a relocation resolves here, not just denver/long-beach.
 */
export function getCrimeRecord(slug: string): CrimeRecord {
  const existing = cache.get(slug);
  if (existing) return existing;
  const path = join(process.cwd(), `data/crime/${slug}.json`);
  if (!existsSync(path)) {
    throw new MissingCityDataError(`No crime data for city "${slug}" (expected ${path})`);
  }
  const parsed = CrimeRecordSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
  cache.set(slug, parsed);
  return parsed;
}

/** Load both crime records for side-by-side comparison. */
export function getAllCrimeRecords(): { denver: CrimeRecord; longBeach: CrimeRecord } {
  return {
    denver: getCrimeRecord("denver"),
    longBeach: getCrimeRecord("long-beach"),
  };
}
