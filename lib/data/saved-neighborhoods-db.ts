import "server-only";
import { cache } from "react";
import { createClient, requireUserId } from "@/lib/supabase/server";
import { parseRows } from "@/lib/data/parse-rows";
import {
  SavedNeighborhoodSchema,
  type SavedNeighborhood,
} from "@/schemas/saved-neighborhood";

export const getSavedNeighborhoods = cache(
  async (): Promise<SavedNeighborhood[]> => {
    const sb = await createClient();
    const { data, error } = await sb
      .from("saved_neighborhoods")
      .select("*")
      .eq("user_id", requireUserId())
      .order("created_at", { ascending: false });
    if (error) throw new Error(`getSavedNeighborhoods: ${error.message}`);
    return parseRows(SavedNeighborhoodSchema, data ?? [], "saved_neighborhoods");
  },
);

// Why: per-card membership lookup runs once per render across N neighborhood
// cards; a Set keeps that O(N) instead of O(N×M).
export function buildSavedKeySet(rows: SavedNeighborhood[]): Set<string> {
  return new Set(rows.map((r) => `${r.city}::${r.neighborhood}`));
}

// Why: the toggle UI needs the row id to call unsaveNeighborhood without an
// extra round-trip; bake it into the same key→id Map the grid hands down.
export function buildSavedIdMap(
  rows: SavedNeighborhood[],
): Map<string, string> {
  return new Map(rows.map((r) => [`${r.city}::${r.neighborhood}`, r.id]));
}
