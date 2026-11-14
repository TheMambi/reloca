"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  createClient,
  friendlyDbError,
  requireUserId,
} from "@/lib/supabase/server";
import { getCity } from "@/lib/data/cities";
import { VIEWING_COOKIE, moveContextFor } from "@/lib/data/relocation-db";
import { seedChecklistIfEmpty } from "@/lib/data/checklist-db";
import { getChecklistSeed } from "@/lib/data/checklist";
import { ADDRESS_LEAD_DAYS, shiftedDueDates } from "@/lib/data/move-seeds";
import type { AddressChangeTarget } from "@/schemas/transitions";
import { RelocationSchema, type Relocation } from "@/schemas";

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
  const parsed = z.uuid().safeParse(id);
  if (parsed.success) {
    store.set(VIEWING_COOKIE, parsed.data, {
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

/**
 * Checklist tasks and address-change deadlines are seeded a fixed number of
 * days from the active move's date. When that date changes, the rows still on
 * their seeded date move with it; anything the user re-dated stays put. Lease
 * tasks follow the lease, not the move, and are refreshed by the lease actions.
 */
async function shiftMoveDependentDates(
  oldDate: string | null,
  newDate: string | null,
): Promise<void> {
  if (oldDate === newDate) return;
  const userId = requireUserId();
  const sb = await createClient();

  const { data: tasks, error: taskErr } = await sb
    .from("checklist_items")
    .select("id, category, order_index, due_date")
    .eq("user_id", userId)
    .neq("category", "lease");
  if (taskErr) throw new Error(`shiftMoveDependentDates.tasks: ${taskErr.message}`);
  const seed = getChecklistSeed();
  const taskChanges = shiftedDueDates(
    tasks ?? [],
    (row) =>
      seed.find((s) => s.category === row.category && s.orderIndex === row.order_index)
        ?.daysOffsetFromMoveDate ?? null,
    oldDate,
    newDate,
  );
  for (const change of taskChanges) {
    const { error } = await sb
      .from("checklist_items")
      .update({ due_date: change.due_date })
      .eq("id", change.id)
      .eq("user_id", userId);
    if (error) throw new Error(`shiftMoveDependentDates.task: ${error.message}`);
  }

  const { data: targets, error: targetErr } = await sb
    .from("address_change_targets")
    .select("id, kind, due_date")
    .eq("user_id", userId);
  if (targetErr) throw new Error(`shiftMoveDependentDates.targets: ${targetErr.message}`);
  const targetChanges = shiftedDueDates(
    targets ?? [],
    (row) => -ADDRESS_LEAD_DAYS[row.kind as AddressChangeTarget["kind"]],
    oldDate,
    newDate,
  );
  for (const change of targetChanges) {
    const { error } = await sb
      .from("address_change_targets")
      .update({ due_date: change.due_date })
      .eq("id", change.id)
      .eq("user_id", userId);
    if (error) throw new Error(`shiftMoveDependentDates.target: ${error.message}`);
  }

  revalidatePath("/checklist");
  revalidatePath("/transitions");
}

export interface RelocationInput {
  label: string;
  origin_slug: string;
  destination_slug: string;
  move_date: string | null;
}

const GONE = "That relocation no longer exists.";

type ActionResult<T> = { ok: true; row: T } | { ok: false; error: string };

const LABEL_MAX = 100;
const NOT_A_DATE = "Move date must be a calendar date.";
// z.iso.date() refuses days that do not exist, such as 2027-02-31.
const MoveDateInput = z.iso.date(NOT_A_DATE).nullable();

/**
 * Shared validation for create + update. Slugs must exist in the registry.
 * Every rule carries its own sentence, because the first one that fails is
 * shown to the person as it is.
 */
const RelocationInputSchema = z
  .object(
    {
      label: z
        .string("Give this relocation a name.")
        .trim()
        .min(1, "Give this relocation a name.")
        .max(LABEL_MAX, `Keep the name under ${LABEL_MAX} characters.`),
      origin_slug: z.string("Pick an origin city.").refine((slug) => !!getCity(slug), "Pick an origin city."),
      destination_slug: z
        .string("Pick a destination city.")
        .refine((slug) => !!getCity(slug), "Pick a destination city."),
      move_date: MoveDateInput,
    },
    "Those details don't look right. Check them and try again.",
  )
  .refine((v) => v.origin_slug !== v.destination_slug, "Origin and destination must be different cities.");

function firstProblem(error: z.ZodError): string {
  return error.issues[0].message;
}

/** Create a new relocation. Never active by default — promote it explicitly. */
export async function createRelocation(
  input: RelocationInput,
): Promise<ActionResult<Relocation>> {
  const checked = RelocationInputSchema.safeParse(input);
  if (!checked.success) return { ok: false, error: firstProblem(checked.error) };
  const fields = checked.data;

  const sb = await createClient();
  const { data: earlier, error: countErr } = await sb
    .from("relocations")
    .select("id")
    .eq("user_id", requireUserId())
    .limit(1);
  if (countErr) return { ok: false, error: friendlyDbError("createRelocation.read", countErr) };
  const { data, error } = await sb
    .from("relocations")
    .insert({
      user_id: requireUserId(),
      label: fields.label,
      origin_slug: fields.origin_slug,
      destination_slug: fields.destination_slug,
      move_date: fields.move_date,
      is_active_move: false,
    })
    .select("*")
    .single();
  if (error) return { ok: false, error: friendlyDbError("createRelocation", error) };
  const row = RelocationSchema.parse(data);

  // The first move brings the template tasks with it. Later moves do not, and
  // reading an empty checklist never does, so a cleared list stays cleared.
  if ((earlier?.length ?? 0) === 0) {
    try {
      await seedChecklistIfEmpty(moveContextFor(row));
    } catch (err) {
      console.error("[action] createRelocation.seedChecklist:", err);
    }
  }

  revalidatePath("/", "layout");
  return { ok: true, row };
}

/** Edit a relocation's label, endpoints, or move date. */
export async function updateRelocation(
  id: string,
  input: RelocationInput,
): Promise<ActionResult<Relocation>> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: GONE };
  const checked = RelocationInputSchema.safeParse(input);
  if (!checked.success) return { ok: false, error: firstProblem(checked.error) };
  const fields = checked.data;

  const sb = await createClient();
  const { data: before, error: readErr } = await sb
    .from("relocations")
    .select("move_date, is_active_move")
    .eq("id", id)
    .eq("user_id", requireUserId())
    .maybeSingle();
  if (readErr) return { ok: false, error: friendlyDbError("updateRelocation.read", readErr) };

  const { data, error } = await sb
    .from("relocations")
    .update({
      label: fields.label,
      origin_slug: fields.origin_slug,
      destination_slug: fields.destination_slug,
      move_date: fields.move_date,
    })
    .eq("id", id)
    .eq("user_id", requireUserId())
    .select("*")
    .single();
  if (error) return { ok: false, error: friendlyDbError("updateRelocation", error) };

  if (before?.is_active_move) {
    try {
      await shiftMoveDependentDates(before.move_date, fields.move_date);
    } catch (err) {
      return { ok: false, error: friendlyDbError("updateRelocation.dates", err as Error) };
    }
  }

  revalidatePath("/", "layout");
  return { ok: true, row: RelocationSchema.parse(data) };
}

/** Delete a relocation. The active move can't be deleted — promote another first. */
export async function deleteRelocation(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: GONE };

  const sb = await createClient();
  const { data: row, error: readErr } = await sb
    .from("relocations")
    .select("is_active_move")
    .eq("id", id)
    .eq("user_id", requireUserId())
    .maybeSingle();
  if (readErr) return { ok: false, error: friendlyDbError("deleteRelocation.read", readErr) };
  if (!row) return { ok: false, error: GONE };
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
  if (!MoveDateInput.safeParse(moveDate).success) return { ok: false, error: NOT_A_DATE };

  const sb = await createClient();
  const { data: before, error: readErr } = await sb
    .from("relocations")
    .select("move_date")
    .eq("user_id", requireUserId())
    .eq("is_active_move", true)
    .maybeSingle();
  if (readErr) return { ok: false, error: friendlyDbError("updateActiveMoveDate.read", readErr) };

  const { data, error } = await sb
    .from("relocations")
    .update({ move_date: moveDate })
    .eq("user_id", requireUserId())
    .eq("is_active_move", true)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: friendlyDbError("updateActiveMoveDate", error) };
  if (!data || !before) {
    return { ok: false, error: "No active move to set a date on yet." };
  }

  try {
    await shiftMoveDependentDates(before.move_date, moveDate);
  } catch (err) {
    return { ok: false, error: friendlyDbError("updateActiveMoveDate.dates", err as Error) };
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
  if (!z.uuid().safeParse(id).success) return { ok: false, error: GONE };

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
