import { z } from "zod";

export const ChecklistCategorySchema = z.enum([
  "pre-move",
  "move-week",
  "post-move",
  "lease",
]);

/**
 * Seed item — the template inserted into Supabase on first run.
 * Uses an offset relative to the configured move date so the template
 * stays valid no matter when NEXT_PUBLIC_MOVE_DATE changes.
 */
export const ChecklistSeedItemSchema = z.object({
  category: ChecklistCategorySchema,
  title: z.string().min(3),
  description: z.string().nullable(),
  daysOffsetFromMoveDate: z.number().int(),
  orderIndex: z.number().int().nonnegative(),
});

export const ChecklistSeedSchema = z.array(ChecklistSeedItemSchema);

/**
 * Live item — what's actually stored in Supabase.
 * Mirrors the table shape; parsed at the boundary before reaching UI code.
 */
export const ChecklistItemSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  category: ChecklistCategorySchema,
  title: z.string().min(1),
  description: z.string().nullable(),
  due_date: z.iso.date().nullable(),
  completed: z.boolean(),
  completed_at: z.iso.datetime({ offset: true }).nullable(),
  order_index: z.number().int().nonnegative(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});

export type ChecklistCategory = z.infer<typeof ChecklistCategorySchema>;
export type ChecklistSeedItem = z.infer<typeof ChecklistSeedItemSchema>;
export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;
