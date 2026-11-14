"use server";

import { revalidatePath } from "next/cache";
import {
  createClient,
  friendlyDbError,
  requireUserId,
} from "@/lib/supabase/server";
import {
  SavedNeighborhoodSchema,
  type SavedNeighborhood,
} from "@/schemas/saved-neighborhood";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NAME_MAX = 100;

export async function saveNeighborhood(
  neighborhood: string,
  city: string,
): Promise<
  { ok: true; row: SavedNeighborhood } | { ok: false; error: string }
> {
  if (typeof neighborhood !== "string" || neighborhood.trim().length === 0 || neighborhood.length > NAME_MAX) {
    return { ok: false, error: "Pick a neighborhood first." };
  }
  if (typeof city !== "string" || city.trim().length === 0 || city.length > NAME_MAX) {
    return { ok: false, error: "Pick a city first." };
  }

  const sb = await createClient();

  // Why: upsert on the UNIQUE(user_id, neighborhood, city) constraint so a
  // race between two clicks doesn't 23505 the user; the existing row comes
  // back instead.
  const { data, error } = await sb
    .from("saved_neighborhoods")
    .upsert(
      {
        user_id: requireUserId(),
        neighborhood: neighborhood.trim(),
        city: city.trim(),
      },
      {
        onConflict: "user_id,neighborhood,city",
        ignoreDuplicates: false,
      },
    )
    .select("*")
    .single();
  if (error) return { ok: false, error: friendlyDbError("saveNeighborhood", error) };

  const parsed = SavedNeighborhoodSchema.parse(data);
  revalidatePath("/properties");
  return { ok: true, row: parsed };
}

export async function unsaveNeighborhood(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof id !== "string" || !UUID_RE.test(id)) {
    return { ok: false, error: "That saved neighborhood no longer exists." };
  }

  const sb = await createClient();
  const { error } = await sb
    .from("saved_neighborhoods")
    .delete()
    .eq("id", id)
    .eq("user_id", requireUserId());
  if (error) return { ok: false, error: friendlyDbError("unsaveNeighborhood", error) };

  revalidatePath("/properties");
  return { ok: true };
}
