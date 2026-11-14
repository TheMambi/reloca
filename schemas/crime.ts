import { z } from "zod";

export const CrimeCategorySchema = z.object({
  category: z.enum(["violent", "property", "qualityOfLife"]),
  subcategory: z.string(),
  count12mo: z.number().int().nonnegative(),
  per1k: z.number().nonnegative(),
  trend12mo: z.array(z.number().int().nonnegative()).length(12),
});

export const HourBucketSchema = z.object({
  hour: z.number().int().min(0).max(23),
  count: z.number().int().nonnegative(),
});

export const MonthBucketSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  total: z.number().int().nonnegative(),
});

export const CrimeRecordSchema = z.object({
  city: z.string(), // city slug — keyed to data/cities.json
  population: z.number().int().positive(),
  reportingPeriod: z.object({
    start: z.iso.date(),
    end: z.iso.date(),
  }),
  summary: z.object({
    violentPer1k: z.number().nonnegative(),
    propertyPer1k: z.number().nonnegative(),
    qualityOfLifePer1k: z.number().nonnegative(),
    totalPer1k: z.number().nonnegative(),
  }),
  byCategory: z.array(CrimeCategorySchema),
  byHourOfDay: z.array(HourBucketSchema).length(24),
  byMonth: z.array(MonthBucketSchema).length(12),
  benchmarkNational: z.object({
    violentPer1k: z.number().nonnegative(),
    propertyPer1k: z.number().nonnegative(),
  }),
  source: z.string().optional(), // DataSource id — keyed to data/data-sources.json
});

export type CrimeCategory = z.infer<typeof CrimeCategorySchema>;
export type HourBucket = z.infer<typeof HourBucketSchema>;
export type MonthBucket = z.infer<typeof MonthBucketSchema>;
export type CrimeRecord = z.infer<typeof CrimeRecordSchema>;

// What each subcategory is called on screen. The data files key them by slug.
const CRIME_SUBCATEGORY_LABELS: Record<string, string> = {
  "aggravated-assault": "Aggravated assault",
  burglary: "Burglary",
  "disorderly-conduct": "Disorderly conduct",
  "drug-violation": "Drug offenses",
  homicide: "Homicide",
  "larceny-theft": "Theft",
  "motor-vehicle-theft": "Vehicle theft",
  robbery: "Robbery",
  "sexual-assault": "Sexual assault",
  vandalism: "Vandalism",
};

/** A slug the map does not know still reads as words, never with hyphens. */
export function crimeSubcategoryLabel(subcategory: string): string {
  const known = CRIME_SUBCATEGORY_LABELS[subcategory];
  if (known) return known;
  const words = subcategory.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
