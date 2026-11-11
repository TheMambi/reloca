import { z } from "zod";

/** One city's monthly median for a cost category, keyed by city slug. */
export const CostCityValueSchema = z.object({
  city: z.string(), // city slug — keyed to data/cities.json
  monthlyMedian: z.number().nonnegative(),
});

export const CostCategorySchema = z.object({
  category: z.enum([
    "housing",
    "utilities",
    "groceries",
    "transport",
    "healthcare",
    "taxes",
    "childcare",
    "entertainment",
  ]),
  values: z.array(CostCityValueSchema),
  notes: z.string().optional(),
  source: z.string().optional(), // DataSource id — keyed to data/data-sources.json
});

export const CommuteScenarioSchema = z.object({
  city: z.string(), // city slug — keyed to data/cities.json
  mode: z.enum(["car", "bike", "walk", "transit"]),
  avgMinutesOneWay: z.number().int().nonnegative(),
  monthlyCost: z.number().nonnegative(),
});

export const CostOfLivingSchema = z.object({
  asOf: z.iso.date(),
  categories: z.array(CostCategorySchema),
  commute: z.array(CommuteScenarioSchema),
});

export type CostCityValue = z.infer<typeof CostCityValueSchema>;
export type CostCategory = z.infer<typeof CostCategorySchema>;
export type CommuteScenario = z.infer<typeof CommuteScenarioSchema>;
export type CostOfLiving = z.infer<typeof CostOfLivingSchema>;
