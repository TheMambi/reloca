import type { Property } from "@/schemas";
import { cityName, cityCode } from "./cities";

export interface NeighborhoodSummary {
  slug: string;
  name: string;
  /** Friendly display name (e.g. "Long Beach"), resolved from the property's slug. */
  city: string;
  /** City slug (e.g. "long-beach") — the registry key. */
  citySlug: string;
  /** 3-letter route code (e.g. "LGB"), resolved from the registry. */
  cityCode: string;
  listingCount: number;
  priceLow: number;
  priceHigh: number;
  bedRange: { min: number; max: number };
  avgSeaProximityKm: number;
  hasBuyListing: boolean;
  centroid: { lat: number; lng: number };
}

// Why: slug must round-trip with `app/properties/[neighborhood]/page.tsx`,
// which decodes `-` back to ` ` and lowercase-compares against
// `property.neighborhood`. Keep this rule in lockstep with that page.
export function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}

export function aggregateNeighborhoods(
  properties: Property[],
  preferredCitySlug?: string,
): NeighborhoodSummary[] {
  const groups = new Map<string, Property[]>();
  for (const p of properties) {
    const key = `${p.city}::${p.neighborhood}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(p);
    else groups.set(key, [p]);
  }

  const summaries: NeighborhoodSummary[] = [];
  for (const listings of groups.values()) {
    const first = listings[0];
    const rentals = listings.filter((p) => p.listingType === "rent");
    const rentalPrices = rentals.map((p) => p.price);
    const beds = listings.map((p) => p.beds);
    const seaTotal = listings.reduce((sum, p) => sum + p.seaProximityKm, 0);
    const latTotal = listings.reduce((sum, p) => sum + p.coordinates.lat, 0);
    const lngTotal = listings.reduce((sum, p) => sum + p.coordinates.lng, 0);
    const n = listings.length;

    summaries.push({
      slug: toSlug(first.neighborhood),
      name: first.neighborhood,
      city: cityName(first.city),
      citySlug: first.city,
      cityCode: cityCode(first.city),
      listingCount: n,
      priceLow: rentalPrices.length > 0 ? Math.min(...rentalPrices) : 0,
      priceHigh: rentalPrices.length > 0 ? Math.max(...rentalPrices) : 0,
      bedRange: { min: Math.min(...beds), max: Math.max(...beds) },
      avgSeaProximityKm: seaTotal / n,
      hasBuyListing: listings.some((p) => p.listingType === "buy"),
      centroid: { lat: latTotal / n, lng: lngTotal / n },
    });
  }

  // Preferred city (the move's destination) first, then alphabetical by city;
  // alphabetical by name within each city.
  return summaries.sort((a, b) => {
    if (a.citySlug !== b.citySlug) {
      if (preferredCitySlug) {
        if (a.citySlug === preferredCitySlug) return -1;
        if (b.citySlug === preferredCitySlug) return 1;
      }
      return a.city.localeCompare(b.city);
    }
    return a.name.localeCompare(b.name);
  });
}
