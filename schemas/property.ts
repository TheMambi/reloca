import { z } from "zod";

export const PropertySchema = z.object({
  id: z.string(),
  city: z.string(), // city slug — keyed to data/cities.json
  neighborhood: z.string(),
  address: z.string(),
  listingType: z.enum(["rent", "buy"]),
  beds: z.number().int().min(0),
  baths: z.number().min(0),
  sqft: z.number().int().positive(),
  price: z.number().int().positive(),
  coordinates: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
  seaProximityKm: z.number().nonnegative(),
  imageUrl: z.union([z.url(), z.string().startsWith("/")]),
  climateProfileRef: z.string(), // city slug — keyed to data/cities.json
  crimeRecordRef: z.string(), // city slug — keyed to data/cities.json
  source: z.string().optional(), // DataSource id — keyed to data/data-sources.json
});

export const PropertiesFileSchema = z.array(PropertySchema);

export type Property = z.infer<typeof PropertySchema>;
