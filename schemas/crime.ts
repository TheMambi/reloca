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
