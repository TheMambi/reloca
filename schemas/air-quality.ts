import { z } from "zod";

/**
 * EPA AirNow current air-quality snapshot for a city (Phase 8 Wave B, AD-030).
 * AirNow's current-observation endpoint returns a point-in-time reading per
 * monitored parameter, so this profile is a timestamped snapshot — `observedAt`
 * carries the reading's local date/hour so the UI can show "as of …" honestly
 * rather than implying a rolling average.
 */
export const AQI_PARAMETERS = [
  "O3",
  "PM2.5",
  "PM10",
  "NO2",
  "CO",
  "SO2",
] as const;

/** The six standard EPA AQI category bands (AirNow `Category.Name`). */
export const AQI_CATEGORIES = [
  "Good",
  "Moderate",
  "Unhealthy for Sensitive Groups",
  "Unhealthy",
  "Very Unhealthy",
  "Hazardous",
] as const;

export const AirQualityReadingSchema = z.object({
  parameter: z.enum(AQI_PARAMETERS),
  aqi: z.number().int().min(0),
  category: z.enum(AQI_CATEGORIES),
});

export const AirQualityProfileSchema = z.object({
  city: z.string(), // city slug — keyed to data/cities.json
  reportingArea: z.string(),
  observedAt: z.string(), // AirNow local observation stamp, e.g. "2026-05-30 14:00 PST"
  dominantParameter: z.enum(AQI_PARAMETERS).nullable(),
  aqi: z.number().int().min(0), // headline AQI (worst parameter)
  category: z.enum(AQI_CATEGORIES),
  readings: z.array(AirQualityReadingSchema),
  source: z.string().optional(), // DataSource id — keyed to data/data-sources.json
});

export type AirQualityReading = z.infer<typeof AirQualityReadingSchema>;
export type AirQualityProfile = z.infer<typeof AirQualityProfileSchema>;
