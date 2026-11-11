import type { Relocation } from "@/schemas";
import { cityName, cityCode } from "./cities";
import { getCostOfLiving, costValueFor } from "./cost";
import { getCrimeRecord } from "./crime";
import { getClimateProfile } from "./climate";
import { getAirQualityProfile } from "./air-quality";
import { getWalkabilityProfile } from "./walkability";
import { getCommunityInsights } from "./community";
import { WALKABILITY_LABELS } from "./walkability";

/**
 * One column of the relocation compare matrix — a relocation reduced to its
 * destination-city reference facts (you're comparing where you'd move TO).
 * Nullable fields degrade to "—" when a city has no data for that domain.
 */
export interface RelocationCompareColumn {
  id: string;
  label: string;
  originName: string;
  destinationName: string;
  originCode: string;
  destinationCode: string;
  isActive: boolean;
  // cost
  costMonthly: number | null;
  costVsOriginPct: number | null;
  // crime (per 1,000 residents, destination)
  violentPer1k: number | null;
  propertyPer1k: number | null;
  // climate (destination)
  floodTier: string | null;
  wildfireScore: number | null;
  heatDays: number | null;
  avgHighF: number | null;
  // air quality (destination)
  aqi: number | null;
  aqiCategory: string | null;
  // walkability (destination)
  walkScore: number | null;
  walkCategory: string | null;
  // community (destination)
  rent2br: number | null;
  vibeCount: number | null;
  // provenance — the distinct source ids behind this column's numbers
  sources: string[];
}

// Loaders throw when a city lacks a data file; a relocation can point at any
// registry city, so guard each domain and degrade to null on absence.
function safe<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

function columnFor(r: Relocation): RelocationCompareColumn {
  const destSlug = r.destination_slug;
  const originSlug = r.origin_slug;

  const cost = getCostOfLiving();
  const destTotal = cost.categories.reduce(
    (s, c) => s + costValueFor(c, destSlug),
    0,
  );
  const originTotal = cost.categories.reduce(
    (s, c) => s + costValueFor(c, originSlug),
    0,
  );
  const costMonthly = destTotal > 0 ? destTotal : null;
  const costVsOriginPct =
    originTotal > 0 && destTotal > 0
      ? Math.round(((destTotal - originTotal) / originTotal) * 100 * 10) / 10
      : null;

  const crime = safe(() => getCrimeRecord(destSlug));
  const climate = safe(() => getClimateProfile(destSlug));
  const air = getAirQualityProfile(destSlug);
  const walk = getWalkabilityProfile(destSlug);
  const community = getCommunityInsights().find((c) => c.city === destSlug);
  const rent2br =
    community?.avgRent.find((u) => u.unit === "2br")?.median ?? null;

  // Distinct source ids behind this column's numbers, in domain order.
  const costSources = cost.categories.map((c) => c.source);
  const sources = [
    ...new Set(
      [
        ...costSources,
        crime?.source,
        climate?.source,
        air?.source,
        walk?.source,
        community?.source,
      ].filter((s): s is string => Boolean(s)),
    ),
  ];

  return {
    id: r.id,
    label: r.label,
    originName: cityName(originSlug),
    destinationName: cityName(destSlug),
    originCode: cityCode(originSlug),
    destinationCode: cityCode(destSlug),
    isActive: r.is_active_move,
    costMonthly,
    costVsOriginPct,
    violentPer1k: crime?.summary.violentPer1k ?? null,
    propertyPer1k: crime?.summary.propertyPer1k ?? null,
    floodTier: climate?.flood.femaTier ?? null,
    wildfireScore: climate?.wildfire.score ?? null,
    heatDays: climate?.heatDaysPerYear ?? null,
    avgHighF: climate?.avgHighF ?? null,
    aqi: air?.aqi ?? null,
    aqiCategory: air?.category ?? null,
    walkScore: walk?.score ?? null,
    walkCategory: walk ? WALKABILITY_LABELS[walk.category] : null,
    rent2br,
    vibeCount: community?.vibeTags.length ?? null,
    sources,
  };
}

/**
 * Build the relocation compare columns — active move first, then the rest in
 * creation order (mirrors the destinations-compare ordering idiom).
 */
export function buildRelocationCompareColumns(
  relocations: Relocation[],
): RelocationCompareColumn[] {
  const ordered = [...relocations].sort((a, b) => {
    if (a.is_active_move && !b.is_active_move) return -1;
    if (!a.is_active_move && b.is_active_move) return 1;
    return a.created_at.localeCompare(b.created_at);
  });
  return ordered.map(columnFor);
}
