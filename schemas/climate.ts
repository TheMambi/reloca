import { z } from "zod";

export const ClimateProfileSchema = z.object({
  city: z.string(), // city slug — keyed to data/cities.json
  flood: z.object({
    femaTier: z.enum(["X", "B", "A", "AE", "VE"]),
    annualChanceFlood: z.number().min(0).max(1),
  }),
  wildfire: z.object({
    score: z.number().int().min(0).max(100),
    nearestActiveZoneKm: z.number().nonnegative().nullable(),
  }),
  seaLevelRise: z.object({
    exposure: z.enum(["none", "low", "moderate", "high"]),
    projection2050cm: z.number().nullable(),
  }),
  earthquake: z.object({
    riskLevel: z.enum(["none", "low", "moderate", "significant", "high"]),
    lastMajorEvent: z.string().optional(),
  }),
  heatDaysPerYear: z.number().int().nonnegative(),
  droughtIndex: z.number().min(-5).max(5),
  annualPrecipitationIn: z.number().nonnegative(),
  avgHighF: z.number(),
  avgLowF: z.number(),
  source: z.string().optional(), // DataSource id — keyed to data/data-sources.json
});

export type ClimateProfile = z.infer<typeof ClimateProfileSchema>;
