import { z } from "zod";

// Mirrors the saved_neighborhoods table (migration 0019). Persisted state for the
// "heart-save" affordance on the /properties Neighborhoods tab — lets the user
// pin a neighborhood for later and (D.7) compare saved ones side-by-side.
//
// PostgREST returns timestamptz with the +00:00 offset form, not Z, so the
// datetime field uses { offset: true } per the project's recurring rule.

export const SavedNeighborhoodSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  // Per-relocation scoping hook (0022). Nullable + optional: the column exists
  // and 0023 backfilled it, but no read path filters on it yet — wiring or
  // reverting is an open product call (audit plan §3.3, AD-041).
  relocation_id: z.uuid().nullable().optional(),
  neighborhood: z.string().min(1),
  city: z.string().min(1),
  notes: z.string().nullable(),
  created_at: z.iso.datetime({ offset: true }),
});

export type SavedNeighborhood = z.infer<typeof SavedNeighborhoodSchema>;
