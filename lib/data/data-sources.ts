import { readFileSync } from "fs";
import { join } from "path";
import { DataSourcesFileSchema } from "@/schemas";
import type { DataSource } from "@/schemas";

let cached: DataSource[] | null = null;

/** The provenance registry (AD-031). Static, version-controlled reference data. */
export function getDataSources(): DataSource[] {
  if (cached) return cached;
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), "data/data-sources.json"), "utf-8"),
  );
  cached = DataSourcesFileSchema.parse(raw);
  return cached;
}

/** Resolve a `source` id to its registry entry, or undefined if unregistered. */
export function getDataSource(id: string): DataSource | undefined {
  return getDataSources().find((s) => s.id === id);
}
