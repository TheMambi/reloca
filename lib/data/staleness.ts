// Data-freshness helpers (Wave 3, AD-041).
//
// Provenance tags used to conflate *tier* with *freshness*: an AirNow snapshot
// ingested six weeks ago still rendered a reassuring green "Live" dot and a
// year-less timestamp. These pure helpers give every provenance surface one
// shared answer to "how old is this, and is that too old for its kind?".

import { todayInZoneIso } from "@/lib/dates";
import type { DataSourceTier } from "@/schemas/data-source";

/**
 * Age in whole days of a provenance timestamp. Accepts the formats that appear
 * in the data files: "YYYY-MM-DD", "YYYY-MM" (treated as the 1st), full ISO
 * datetimes, and AirNow's "YYYY-MM-DD HH:mm TZ". Returns null when unparsable.
 */
export function ageInDays(
  stamp: string | null | undefined,
  todayIso: string = todayInZoneIso(),
): number | null {
  if (!stamp) return null;
  const m = stamp.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3] ?? "01"}`;
  const then = new Date(`${iso}T00:00:00.000Z`).getTime();
  const now = new Date(`${todayIso}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(then) || !Number.isFinite(now)) return null;
  return Math.max(0, Math.round((now - then) / 86_400_000));
}

/**
 * Per-kind staleness thresholds, in days. A live AQI reading goes stale in
 * days; an annual benchmark (HUD FMR, NOAA normals, EPA walkability) is good
 * for about a year; modeled values don't go stale (they were never fresh).
 */
export const STALE_AFTER_DAYS = {
  airQuality: 3,
  liveAnnual: 400,
  modeled: Number.POSITIVE_INFINITY,
} as const;

export function isStale(
  stamp: string | null | undefined,
  thresholdDays: number,
  todayIso: string = todayInZoneIso(),
): boolean {
  const age = ageInDays(stamp, todayIso);
  if (age === null) return false; // unknown age → don't cry wolf
  return age > thresholdDays;
}

/** Threshold for a data-source registry entry, by id + tier. */
export function sourceStaleThreshold(source: {
  id: string;
  tier: DataSourceTier;
}): number {
  if (source.tier !== "live") return STALE_AFTER_DAYS.modeled;
  if (source.id.startsWith("air-quality")) return STALE_AFTER_DAYS.airQuality;
  return STALE_AFTER_DAYS.liveAnnual;
}
