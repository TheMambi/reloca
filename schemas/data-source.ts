import { z } from "zod";

/**
 * Provenance registry entry. Every reference record points at one of these by
 * `id`, so the UI can render an honest "Source: … · fetched …" tag on each data
 * surface. `tier` is the honesty knob (AD-031): `live` = pulled from a real API,
 * `modeled` = hand-authored / derived estimate, `community` = qualitative.
 */
export const DataSourceTierSchema = z.enum(["live", "modeled", "community"]);

export const DataSourceSchema = z.object({
  id: z.string(), // referenced by `source` on reference records, e.g. "census-acs-2024"
  label: z.string(), // friendly name shown to the user, e.g. "Modeled cost of living"
  provider: z.string(), // who publishes it, e.g. "U.S. Census Bureau"
  url: z.url(),
  tier: DataSourceTierSchema,
  fetchedAt: z.iso.date(), // when the data was pulled / authored
  notes: z.string().optional(),
});

export const DataSourcesFileSchema = z.array(DataSourceSchema);

export type DataSourceTier = z.infer<typeof DataSourceTierSchema>;
export type DataSource = z.infer<typeof DataSourceSchema>;
