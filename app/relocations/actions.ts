"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import {
  createClient,
  friendlyDbError,
  requireUserId,
} from "@/lib/supabase/server";
import { getCity } from "@/lib/data/cities";
import { VIEWING_COOKIE } from "@/lib/data/relocation-db";
import { RelocationSchema, type Relocation } from "@/schemas";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 180 days — long enough that a viewing choice survives realistic gaps between
// sessions, short enough that a forgotten comparison eventually self-clears.
const VIEWING_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

/**
 * Persist (or clear) the viewed relocation so it survives plain sidebar/drawer
 * navigation (Wave D, D.1). Passing null clears it — the switcher does this
 * when the user views the active move, keeping "active" the clean default.
 */
export async function setViewingRelocation(id: string | null): Promise<void> {
  const store = await cookies();
  if (id && UUID_RE.test(id)) {
    store.set(VIEWING_COOKIE, id, {
      path: "/",
      maxAge: VIEWING_COOKIE_MAX_AGE,
      sameSite: "lax",
    });
  } else {
    store.delete(VIEWING_COOKIE);
  }
}

/** Drop the viewing cookie — used after a promote/delete so the resolver falls
 *  back to the active move rather than a stale or no-longer-relevant id. */
async function clearViewingCookie(): Promise<void> {
  (await cookies()).delete(VIEWING_COOKIE);
}

export interface RelocationInput {
  label: string;
  origin_slug: string;
  destination_slug: string;
  move_date: string | null;
}

type ActionResult<T> = { ok: true; row: T } | { ok: false; error: string };

/** Shared validation for create + update — slugs must exist in the registry. */
function validateInput(input: RelocationInput): string | null {
  if (typeof input.label !== "string" || input.label.trim().length === 0) {
    return "Give this relocation a name.";
  }
  if (!getCity(input.origin_slug)) {
    return "Pick an origin city.";
  }
  if (!getCity(input.destination_slug)) {
    return "Pick a destination city.";
  }
  if (input.origin_slug === input.destination_slug) {
    return "Origin and destination must be different cities.";
  }
  if (
    input.move_date !== null &&
    !/^\d{4}-\d{2}-\d{2}$/.test(input.move_date)
  ) {
    return "Move date must be a calendar date.";
  }
  return null;
}

/** Create a new relocation. Never active by default — promote it explicitly. */
export async function createRelocation(
  input: RelocationInput,
): Promise<ActionResult<Relocation>> {
  const invalid = validateInput(input);
  if (invalid) return { ok: false, error: invalid };

  const sb = await createClient();
  const { data, error } = await sb
    .from("relocations")
    .insert({
      user_id: requireUserId(),
      label: input.label.trim(),
      origin_slug: input.origin_slug,
      destination_slug: input.destination_slug,
      move_date: input.move_date,
      is_active_move: false,
    })
    .select("*")
    .single();
  if (error) return { ok: false, error: friendlyDbError("createRelocation", error) };

  revalidatePath("/", "layout");
  return { ok: true, row: RelocationSchema.parse(data) };
}

/** Edit a relocation's label, endpoints, or move date. */
export async function updateRelocation(
  id: string,
  input: RelocationInput,
): Promise<ActionResult<Relocation>> {
  if (!UUID_RE.test(id)) return { ok: false, error: "That relocation no longer exists." };
  const invalid = validateInput(input);
  if (invalid) return { ok: false, error: invalid };

  const sb = await createClient();
  const { data, error } = await sb
    .from("relocations")
    .update({
      label: input.label.trim(),
      origin_slug: input.origin_slug,
      destination_slug: input.destination_slug,
      move_date: input.move_date,
    })
    .eq("id", id)
    .eq("user_id", requireUserId())
    .select("*")
    .single();
  if (error) return { ok: false, error: friendlyDbError("updateRelocation", error) };

  revalidatePath("/", "layout");
  return { ok: true, row: RelocationSchema.parse(data) };
}

/** Delete a relocation. The active move can't be deleted — promote another first. */
export async function deleteRelocation(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!UUID_RE.test(id)) return { ok: false, error: "That relocation no longer exists." };

  const sb = await createClient();
  const { data: row, error: readErr } = await sb
    .from("relocations")
    .select("is_active_move")
    .eq("id", id)
    .eq("user_id", requireUserId())
    .maybeSingle();
  if (readErr) return { ok: false, error: friendlyDbError("deleteRelocation.read", readErr) };
  if (!row) return { ok: false, error: "That relocation no longer exists." };
  if (row.is_active_move) {
    return {
      ok: false,
      error: "Set another relocation as your active move before deleting this one.",
    };
  }

  const { error } = await sb
    .from("relocations")
    .delete()
    .eq("id", id)
    .eq("user_id", requireUserId());
  if (error) return { ok: false, error: friendlyDbError("deleteRelocation", error) };

  // If the deleted relocation was the one being viewed, drop the stale cookie
  // so the resolver doesn't keep trying to surface a row that's gone.
  const store = await cookies();
  if (store.get(VIEWING_COOKIE)?.value === id) {
    store.delete(VIEWING_COOKIE);
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Set (or clear) the ACTIVE move's date — the top-strip countdown editor's
 * write path (Wave 1, AD-039). Before this, the editor wrote localStorage only
 * while every other surface read `relocations.move_date`, so editing the date
 * changed nothing but the strip. Returns the persisted date so the client can
 * clear its localStorage override once the DB is the source of truth again.
 */
export async function updateActiveMoveDate(
  moveDate: string | null,
): Promise<{ ok: true; moveDate: string | null } | { ok: false; error: string }> {
  if (moveDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(moveDate)) {
    return { ok: false, error: "Move date must be a calendar date." };
  }

  const sb = await createClient();
  const { data, error } = await sb
    .from("relocations")
    .update({ move_date: moveDate })
    .eq("user_id", requireUserId())
    .eq("is_active_move", true)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: friendlyDbError("updateActiveMoveDate", error) };
  if (!data) {
    return { ok: false, error: "No active move to set a date on yet." };
  }

  revalidatePath("/", "layout");
  return { ok: true, moveDate };
}

/**
 * Promote a relocation to the active move — the one the execution tiles track.
 * Clears the current active first so the partial-unique `is_active_move` index
 * never sees two true rows (single-user, so the tiny gap between the two writes
 * is harmless).
 */
export async function setActiveMove(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!UUID_RE.test(id)) return { ok: false, error: "That relocation no longer exists." };

  const sb = await createClient();
  const { error: clearErr } = await sb
    .from("relocations")
    .update({ is_active_move: false })
    .eq("user_id", requireUserId())
    .eq("is_active_move", true);
  if (clearErr) return { ok: false, error: friendlyDbError("setActiveMove.clear", clearErr) };

  const { error } = await sb
    .from("relocations")
    .update({ is_active_move: true })
    .eq("id", id)
    .eq("user_id", requireUserId());
  if (error) return { ok: false, error: friendlyDbError("setActiveMove", error) };

  // The promoted relocation is now the active move — the clean default. Drop
  // any viewing cookie so the user lands back on the active view everywhere.
  await clearViewingCookie();

  revalidatePath("/", "layout");
  return { ok: true };
}
