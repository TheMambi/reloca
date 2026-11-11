import { z } from "zod";

export const ScenarioKindEnum = z.enum(["diy","movers","hybrid","custom"]);

export const LineItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  cost: z.number().nonnegative(),
});
export type LineItem = z.infer<typeof LineItemSchema>;

export const ScenarioSchema = z.object({
  id: z.string().min(1),
  kind: ScenarioKindEnum,
  label: z.string().min(1),
  line_items: z.array(LineItemSchema),
  total: z.number().nonnegative(),
});
export type Scenario = z.infer<typeof ScenarioSchema>;

export const MoveEstimateSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  distance_miles: z.number().nonnegative().nullable(),
  volume_cuft: z.number().nonnegative().nullable(),
  move_date: z.iso.date().nullable(),
  scenarios: z.array(ScenarioSchema),
  chosen_scenario_id: z.string().nullable(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});
export type MoveEstimate = z.infer<typeof MoveEstimateSchema>;

export const MOVE_COST_NUMERIC_FIELDS = ["distance_miles","volume_cuft"] as const;

/**
 * Runtime gate for `upsertMoveEstimate`'s patch argument (Wave 1, AD-039).
 * Server actions are network-reachable endpoints; the `scenarios` jsonb column
 * is written raw and every read Zod-parses — so one malformed write would make
 * every subsequent read throw. `.strict()` also rejects smuggled extra keys.
 * Key-presence semantics are preserved: Zod drops absent optional keys, so
 * `"distance_miles" in parsed` still distinguishes "not provided" from null.
 */
export const MoveEstimatePatchSchema = z
  .object({
    distance_miles: z.number().nonnegative().nullable().optional(),
    volume_cuft: z.number().nonnegative().nullable().optional(),
    move_date: z.iso.date().nullable().optional(),
    scenarios: z.array(ScenarioSchema).optional(),
  })
  .strict();
export type MoveEstimatePatch = z.infer<typeof MoveEstimatePatchSchema>;
