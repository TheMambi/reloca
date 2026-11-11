import { z } from "zod";

/**
 * Walkability profile for a city, from the EPA National Walkability Index
 * (Smart Location Database) — Phase 8 Wave C (C.8, supersedes the Wave B OSM
 * proxy). The block-group-level `NatWalkInd` (1–20 scale) is population-weighted
 * across the block groups within ~10 km of the city centroid and mapped to a
 * 0–100 `score`. Pulled live from EPA's GeoPlatform ArcGIS service (public
 * domain), so its DataSource is tagged `live`. `category` follows EPA's four
 * walkability tiers (which also mirror Walk Score's familiar bands).
 */
export const WALKABILITY_CATEGORIES = [
  "car-dependent",
  "somewhat-walkable",
  "very-walkable",
  "walker-paradise",
] as const;

export const WalkabilityProfileSchema = z.object({
  city: z.string(), // city slug — keyed to data/cities.json
  score: z.number().int().min(0).max(100), // NatWalkInd mapped to 0–100
  category: z.enum(WALKABILITY_CATEGORIES),
  natWalkInd: z.number().min(0).max(20), // EPA National Walkability Index (1–20)
  blockGroupCount: z.number().int().nonnegative(), // block groups averaged
  population: z.number().int().nonnegative(), // population-weighting denominator
  source: z.string().optional(), // DataSource id — keyed to data/data-sources.json
});

export type WalkabilityProfile = z.infer<typeof WalkabilityProfileSchema>;
