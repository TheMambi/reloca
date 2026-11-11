import { z } from "zod";

/**
 * Per-city ingestion anchors. These keys point the Wave B ingestion script
 * (`scripts/ingest-city.ts`) at the right record in each free API. They are
 * inert until ingestion runs — no UI reads them. Seeded best-effort in Wave A;
 * Wave B verifies each against the live API before trusting it (AD-017 lesson:
 * a hardcoded third-party ID must be smoke-tested against the live endpoint).
 */
export const CityMetroSchema = z.object({
  hudEntityId: z.string(), // HUD FMR metro entity, e.g. "METRO31080MM4480"
  censusPlaceFips: z.string(), // Census place FIPS (state + place), e.g. "0643000"
  noaaStationId: z.string(), // NOAA CDO GHCND station, e.g. "GHCND:USW00023129"
});

export const CitySchema = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase kebab-case"),
  displayName: z.string().min(1),
  stateCode: z.string().length(2),
  routeCode: z.string().length(3), // mono UI code: "DEN" | "LGB" | "SAC"
  lat: z.number(),
  lng: z.number(),
  population: z.number().int().positive(),
  metro: CityMetroSchema,
});

export const CitiesFileSchema = z.array(CitySchema);

export type CityMetro = z.infer<typeof CityMetroSchema>;
export type City = z.infer<typeof CitySchema>;
