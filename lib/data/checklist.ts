import { readFileSync } from "fs";
import { join } from "path";
import { ChecklistSeedSchema } from "@/schemas";
import type { ChecklistSeedItem } from "@/schemas";

let cached: ChecklistSeedItem[] | null = null;

export function getChecklistSeed(): ChecklistSeedItem[] {
  if (cached) return cached;
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), "data/checklist-seed.json"), "utf-8")
  );
  cached = ChecklistSeedSchema.parse(raw);
  return cached;
}
