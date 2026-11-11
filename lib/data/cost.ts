import { readFileSync } from "fs";
import { join } from "path";
import { CostOfLivingSchema } from "@/schemas";
import type { CostOfLiving, CostCategory } from "@/schemas";

let cached: CostOfLiving | null = null;

export function getCostOfLiving(): CostOfLiving {
  if (cached) return cached;
  const raw = JSON.parse(
    readFileSync(join(process.cwd(), "data/cost-of-living.json"), "utf-8")
  );
  cached = CostOfLivingSchema.parse(raw);
  return cached;
}

/** Monthly median for a category in a given city slug; 0 when the city is absent. */
export function costValueFor(category: CostCategory, citySlug: string): number {
  return category.values.find((v) => v.city === citySlug)?.monthlyMedian ?? 0;
}
