import "server-only";
import { cache } from "react";
import { createClient, requireUserId } from "@/lib/supabase/server";
import {
  MoveEstimateSchema,
  MOVE_COST_NUMERIC_FIELDS,
  type MoveEstimate, type Scenario,
} from "@/schemas/move-cost";
import { coerceNumerics } from "@/schemas/lease";

export const getMoveEstimate = cache(async (): Promise<MoveEstimate | null> => {
  const sb = await createClient();
  const { data, error } = await sb
    .from("move_estimates").select("*")
    .eq("user_id", requireUserId())
    .limit(1).maybeSingle();
  if (error) throw new Error(`getMoveEstimate: ${error.message}`);
  if (!data) return null;
  return MoveEstimateSchema.parse(coerceNumerics(data, [...MOVE_COST_NUMERIC_FIELDS]));
});

// Costs are kept in whole dollars, the unit every screen shows. Rounding each
// line before summing keeps a total equal to the sum of its displayed lines.
export function recomputeScenarioTotals(scenarios: Scenario[]): Scenario[] {
  return scenarios.map((s) => {
    const line_items = s.line_items.map((item) => ({ ...item, cost: Math.round(item.cost) }));
    return {
      ...s,
      line_items,
      total: line_items.reduce((sum, item) => sum + item.cost, 0),
    };
  });
}

export function buildDefaultScenarios(): Scenario[] {
  return [
    {
      id: "diy",
      kind: "diy",
      label: "Drive a rental truck yourself",
      line_items: [
        { id: "diy-truck",   name: "Truck rental",            cost: 0 },
        { id: "diy-fuel",    name: "Fuel",                    cost: 0 },
        { id: "diy-toll",    name: "Tolls",                   cost: 0 },
        { id: "diy-lodging", name: "Hotel along the way",     cost: 0 },
        { id: "diy-meals",   name: "Meals along the way",     cost: 0 },
        { id: "diy-supplies",name: "Boxes & packing supplies",cost: 0 },
        { id: "diy-help",    name: "Loading help",            cost: 0 },
        { id: "diy-storage", name: "Storage (if needed)",     cost: 0 },
      ],
      total: 0,
    },
    {
      id: "movers",
      kind: "movers",
      label: "Hire professional movers",
      line_items: [
        { id: "mov-quote",     name: "Mover quote",        cost: 0 },
        { id: "mov-supplies",  name: "Packing supplies",   cost: 0 },
        { id: "mov-tip",       name: "Tip",                cost: 0 },
        { id: "mov-insurance", name: "Insurance",          cost: 0 },
        { id: "mov-storage",   name: "Storage (if needed)",cost: 0 },
        { id: "mov-misc",      name: "Anything else",      cost: 0 },
      ],
      total: 0,
    },
    {
      id: "hybrid",
      kind: "hybrid",
      label: "Split — movers help, you drive",
      line_items: [
        { id: "hyb-load",   name: "Movers load only",   cost: 0 },
        { id: "hyb-truck",  name: "Truck rental",       cost: 0 },
        { id: "hyb-fuel",   name: "Fuel",               cost: 0 },
        { id: "hyb-unload", name: "Movers unload only", cost: 0 },
        { id: "hyb-misc",   name: "Anything else",      cost: 0 },
      ],
      total: 0,
    },
  ];
}
