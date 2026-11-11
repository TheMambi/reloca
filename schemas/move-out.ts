import { z } from "zod";

export const MoveOutWalkthroughSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  lease_terms_id: z.uuid().nullable(),
  walkthrough_date: z.iso.date().nullable(),
  overall_notes: z.string().nullable(),
  pdf_generated_at: z.iso.datetime({ offset: true }).nullable(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});
export type MoveOutWalkthrough = z.infer<typeof MoveOutWalkthroughSchema>;

export const RatingEnum = z.number().int().min(1).max(5).nullable();

export const MoveOutRoomRecordSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  walkthrough_id: z.uuid(),
  room_name: z.string().min(1),
  condition_rating: RatingEnum,
  cleanliness_rating: RatingEnum,
  walls_status: z.string().nullable(),
  floors_status: z.string().nullable(),
  appliances_status: z.string().nullable(),
  fixtures_status: z.string().nullable(),
  notes: z.string().nullable(),
  order_index: z.number().int().nonnegative(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});
export type MoveOutRoomRecord = z.infer<typeof MoveOutRoomRecordSchema>;
