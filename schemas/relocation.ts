import { z } from "zod";

/**
 * A relocation scopes the reference comparison (origin↔destination city facts)
 * and a thin slice of user data (candidate buildings + saved neighborhoods).
 * Exactly one row has is_active_move = true — it drives the execution tiles
 * (checklist, lease, transitions, …). The heavy execution modules stay singular
 * (Light model, AD-028). origin_slug / destination_slug are FK-in-spirit to
 * data/cities.json.
 */
export const RelocationSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  label: z.string().min(1),
  origin_slug: z.string(), // city slug — keyed to data/cities.json
  destination_slug: z.string(), // city slug — keyed to data/cities.json
  move_date: z.iso.date().nullable(),
  is_active_move: z.boolean(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});

export type Relocation = z.infer<typeof RelocationSchema>;
