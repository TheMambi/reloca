// Pure aggregation: turns saved neighborhoods + raw fixtures into the
// side-by-side compare matrix shape consumed by <NeighborhoodCompareTable>.
//
// Why no Zod schema: this is a derived render shape, not a persisted boundary.
// Save / load goes through SavedNeighborhoodSchema; everything else here is
// computed at request time from already-validated inputs.

import type { ClimateProfile, CrimeRecord, Property } from "@/schemas";
import type { SavedNeighborhood } from "@/schemas/saved-neighborhood";
import { cityName, cityCode, citySlugFromName } from "./cities";
import { getCrimeRecord } from "./crime";
import { getClimateProfile } from "./climate";
import { toSlug } from "./neighborhoods";

export type ClimateConcern =
  | { kind: "flood"; label: string }
  | { kind: "wildfire"; label: string }
  | { kind: "sea-level"; label: string }
  | { kind: "earthquake"; label: string }
  | { kind: "heat"; label: string }
  | { kind: "low"; label: string };

export interface NeighborhoodCompareColumn {
  key: string;
  slug: string;
  neighborhood: string;
  city: string;
  cityCode: string;
  listingCount: number;
  avgRentMonthly: number | null;
  bedRangeLabel: string;
  avgSeaProximityKm: number;
  topCrimeCategories: { subcategory: string; per1k: number }[];
  topClimateConcerns: ClimateConcern[];
}

export interface NeighborhoodCompareView {
  columns: NeighborhoodCompareColumn[];
}

function bedRangeLabel(min: number, max: number): string {
  if (min === 0 && max === 0) return "Studio";
  if (min === max) return min === 0 ? "Studio" : `${min} bed`;
  if (min === 0) return `Studio–${max} bed`;
  return `${min}–${max} bed`;
}

// Crime/climate live at the city grain, keyed by slug. Resolve safely so a
// saved city without a data file degrades to null rather than throwing.
function safeCrime(slug: string): CrimeRecord | null {
  try {
    return getCrimeRecord(slug);
  } catch {
    return null;
  }
}
function safeClimate(slug: string): ClimateProfile | null {
  try {
    return getClimateProfile(slug);
  } catch {
    return null;
  }
}

// Why: crime data lives at the city grain (one record per city), not the
// neighborhood. Two saved neighborhoods in the same city share the same crime
// rows by design — surfacing per-neighborhood crime would require data we
// don't have in v1.
function topCrimeCategories(
  record: CrimeRecord,
): { subcategory: string; per1k: number }[] {
  return [...record.byCategory]
    .sort((a, b) => b.per1k - a.per1k)
    .slice(0, 3)
    .map((c) => ({ subcategory: c.subcategory, per1k: c.per1k }));
}

function topClimateConcerns(profile: ClimateProfile): ClimateConcern[] {
  const concerns: ClimateConcern[] = [];

  // Flood — "real" flood zone. Skip X (low risk) unless nothing else fires.
  const tier = profile.flood.femaTier;
  if (tier === "A" || tier === "AE" || tier === "VE") {
    concerns.push({ kind: "flood", label: `Flood zone ${tier}` });
  }

  // Wildfire
  if (profile.wildfire.score > 60) {
    concerns.push({
      kind: "wildfire",
      label: `Wildfire score ${profile.wildfire.score}/100`,
    });
  }

  // Sea-level rise
  const exposure = profile.seaLevelRise.exposure;
  if (exposure === "moderate" || exposure === "high") {
    concerns.push({
      kind: "sea-level",
      label: `Sea-level exposure: ${exposure}`,
    });
  }

  // Earthquake
  const eq = profile.earthquake.riskLevel;
  if (eq === "significant" || eq === "high") {
    const adj = eq === "significant" ? "Significant" : "High";
    concerns.push({
      kind: "earthquake",
      label: `${adj} earthquake risk`,
    });
  }

  // Heat
  if (profile.heatDaysPerYear > 50) {
    concerns.push({
      kind: "heat",
      label: `${profile.heatDaysPerYear} days >90°F/yr`,
    });
  }

  if (concerns.length === 0) {
    return [{ kind: "low", label: "Low climate exposure" }];
  }

  return concerns.slice(0, 3);
}

export function buildNeighborhoodCompareRows(
  savedRows: SavedNeighborhood[],
  properties: Property[],
): NeighborhoodCompareView | null {
  if (savedRows.length === 0) return null;

  const columns: NeighborhoodCompareColumn[] = [];

  for (const saved of savedRows) {
    // saved rows carry a display name; resolve it to a registry slug. Skip
    // cities that aren't in the registry (no reference data to compare).
    const slug = citySlugFromName(saved.city);
    if (!slug) continue;
    const cityCrime = safeCrime(slug);
    const cityClimate = safeClimate(slug);
    if (!cityCrime || !cityClimate) continue;

    // properties carry a city slug; saved rows carry a display name. Resolve
    // the slug to its display name so the join holds after the genericization.
    const matches = properties.filter(
      (p) =>
        cityName(p.city) === saved.city && p.neighborhood === saved.neighborhood,
    );

    const rentals = matches.filter((p) => p.listingType === "rent");
    const rentMean =
      rentals.length > 0
        ? Math.round(
            rentals.reduce((sum, p) => sum + p.price, 0) / rentals.length,
          )
        : null;

    const beds = matches.map((p) => p.beds);
    const bedMin = beds.length > 0 ? Math.min(...beds) : 0;
    const bedMax = beds.length > 0 ? Math.max(...beds) : 0;

    const seaTotal = matches.reduce((sum, p) => sum + p.seaProximityKm, 0);
    const avgSea = matches.length > 0 ? seaTotal / matches.length : 0;

    columns.push({
      key: `${saved.city}::${saved.neighborhood}`,
      slug: toSlug(saved.neighborhood),
      neighborhood: saved.neighborhood,
      city: saved.city,
      cityCode: cityCode(slug),
      listingCount: matches.length,
      avgRentMonthly: rentMean,
      bedRangeLabel: bedRangeLabel(bedMin, bedMax),
      avgSeaProximityKm: avgSea,
      topCrimeCategories: topCrimeCategories(cityCrime),
      topClimateConcerns: topClimateConcerns(cityClimate),
    });
  }

  if (columns.length === 0) return null;
  return { columns };
}
