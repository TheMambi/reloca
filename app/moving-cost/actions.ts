"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createClient,
  friendlyDbError,
  requireUserId,
} from "@/lib/supabase/server";
import {
  MoveEstimateSchema,
  MoveEstimatePatchSchema,
  LineItemSchema,
  MOVE_COST_NUMERIC_FIELDS,
  type MoveEstimate,
  type Scenario,
  type LineItem,
} from "@/schemas/move-cost";
import { coerceNumerics } from "@/schemas/lease";
import {
  recomputeScenarioTotals,
  buildDefaultScenarios,
} from "@/lib/data/move-cost-db";

// PostgREST returns numeric() columns as strings, so any returned row must run
// through coerceNumerics before MoveEstimateSchema.parse. The `scenarios`
// column is jsonb and round-trips cleanly as a JS array of Scenario objects.
function parseRow(row: Record<string, unknown>): MoveEstimate {
  return MoveEstimateSchema.parse(coerceNumerics(row, [...MOVE_COST_NUMERIC_FIELDS]));
}

// === upsertMoveEstimate ===
//
// Single-row-per-user table (UNIQUE(user_id)). SELECT-then-INSERT-or-UPDATE so
// we know whether to seed default scenarios. When `patch.scenarios` is provided
// (or we are seeding defaults), totals are recomputed first.
export async function upsertMoveEstimate(rawPatch: {
  distance_miles?: number | null;
  volume_cuft?: number | null;
  move_date?: string | null;
  scenarios?: Scenario[];
}): Promise<{ ok: true; row: MoveEstimate } | { ok: false; error: string }> {
  // Runtime gate (AD-039): a malformed scenarios payload written to jsonb
  // would make every subsequent Zod-parsed read throw — reject it here.
  const parsedPatch = MoveEstimatePatchSchema.safeParse(rawPatch);
  if (!parsedPatch.success) {
    return { ok: false, error: "Those estimate details don't look right — try again." };
  }
  const patch = parsedPatch.data;

  const sb = await createClient();

  const { data: existing, error: getErr } = await sb
    .from("move_estimates")
    .select("id")
    .eq("user_id", requireUserId())
    .maybeSingle();
  if (getErr) return { ok: false, error: friendlyDbError("upsertMoveEstimate.read", getErr) };

  if (!existing) {
    const seeded = patch.scenarios ?? buildDefaultScenarios();
    const scenarios = recomputeScenarioTotals(seeded);

    const { data, error } = await sb
      .from("move_estimates")
      .insert({
        user_id: requireUserId(),
        distance_miles: patch.distance_miles ?? null,
        volume_cuft: patch.volume_cuft ?? null,
        move_date: patch.move_date ?? null,
        scenarios,
      })
      .select("*")
      .single();
    if (error) return { ok: false, error: friendlyDbError("upsertMoveEstimate.insert", error) };

    revalidatePath("/moving-cost");
    revalidatePath("/");
    return { ok: true, row: parseRow(data) };
  }

  // Merge update — only fields actually present in the patch are written.
  const update: {
    distance_miles?: number | null;
    volume_cuft?: number | null;
    move_date?: string | null;
    scenarios?: Scenario[];
  } = {};
  if (Object.prototype.hasOwnProperty.call(patch, "distance_miles")) {
    update.distance_miles = patch.distance_miles ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "volume_cuft")) {
    update.volume_cuft = patch.volume_cuft ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "move_date")) {
    update.move_date = patch.move_date ?? null;
  }
  if (patch.scenarios !== undefined) {
    update.scenarios = recomputeScenarioTotals(patch.scenarios);
  }

  const { data, error } = await sb
    .from("move_estimates")
    .update(update)
    .eq("user_id", requireUserId())
    .select("*")
    .single();
  if (error) return { ok: false, error: friendlyDbError("upsertMoveEstimate.update", error) };

  revalidatePath("/moving-cost");
  revalidatePath("/");
  return { ok: true, row: parseRow(data) };
}

// === selectScenario ===
//
// Validates that scenarioId matches one of the scenarios already in the row.
// Fails explicitly if the row doesn't exist or the id is unknown — silent
// no-op writes would mask UI bugs / stale state.
export async function selectScenario(
  scenarioId: string,
): Promise<{ ok: true; row: MoveEstimate } | { ok: false; error: string }> {
  if (!z.string().min(1).safeParse(scenarioId).success) {
    return { ok: false, error: "Scenario not found" };
  }

  const sb = await createClient();

  const { data: existing, error: getErr } = await sb
    .from("move_estimates")
    .select("scenarios")
    .eq("user_id", requireUserId())
    .maybeSingle();
  if (getErr) return { ok: false, error: friendlyDbError("selectScenario.read", getErr) };
  if (!existing) return { ok: false, error: "No estimate started yet" };

  const scenarios = (existing.scenarios as Scenario[] | null) ?? [];
  if (!scenarios.some((s) => s.id === scenarioId)) {
    return { ok: false, error: "Scenario not found" };
  }

  const { data, error } = await sb
    .from("move_estimates")
    .update({ chosen_scenario_id: scenarioId })
    .eq("user_id", requireUserId())
    .select("*")
    .single();
  if (error) return { ok: false, error: friendlyDbError("selectScenario.update", error) };

  revalidatePath("/moving-cost");
  revalidatePath("/");
  return { ok: true, row: parseRow(data) };
}

// === updateScenarioLineItems ===
//
// Patches the line_items array of one scenario, leaving the other scenarios
// untouched. recomputeScenarioTotals operates on the full array (and is pure),
// so we splice in the edited scenario and let it refresh that scenario's
// total from the new line_items.
export async function updateScenarioLineItems(
  scenarioId: string,
  rawLineItems: LineItem[],
): Promise<{ ok: true; row: MoveEstimate } | { ok: false; error: string }> {
  if (!z.string().min(1).safeParse(scenarioId).success) {
    return { ok: false, error: "Scenario not found" };
  }
  // Same jsonb-write gate as upsertMoveEstimate (AD-039).
  const parsedItems = LineItemSchema.array().safeParse(rawLineItems);
  if (!parsedItems.success) {
    return { ok: false, error: "Those line items don't look right — try again." };
  }
  const lineItems = parsedItems.data;

  const sb = await createClient();

  const { data: existing, error: getErr } = await sb
    .from("move_estimates")
    .select("scenarios")
    .eq("user_id", requireUserId())
    .maybeSingle();
  if (getErr) return { ok: false, error: friendlyDbError("updateScenarioLineItems.read", getErr) };
  if (!existing) return { ok: false, error: "No estimate started yet" };

  const scenarios = (existing.scenarios as Scenario[] | null) ?? [];
  const idx = scenarios.findIndex((s) => s.id === scenarioId);
  if (idx === -1) return { ok: false, error: "Scenario not found" };

  const next = scenarios.map((s, i) =>
    i === idx ? { ...s, line_items: lineItems } : s,
  );
  const recomputed = recomputeScenarioTotals(next);

  const { data, error } = await sb
    .from("move_estimates")
    .update({ scenarios: recomputed })
    .eq("user_id", requireUserId())
    .select("*")
    .single();
  if (error) return { ok: false, error: friendlyDbError("updateScenarioLineItems.update", error) };

  revalidatePath("/moving-cost");
  revalidatePath("/");
  return { ok: true, row: parseRow(data) };
}
