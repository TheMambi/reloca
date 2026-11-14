"use server";

import { z } from "zod";
import { getActiveMoveContext } from "@/lib/data/relocation-db";
import { ADDRESS_LEAD_DAYS, seededDueDate } from "@/lib/data/move-seeds";
import { revalidatePath } from "next/cache";
import {
  createClient,
  friendlyDbError,
  requireUserId,
} from "@/lib/supabase/server";
import {
  UtilityTransitionSchema,
  AddressChangeTargetSchema,
  type UtilityTransition,
  type AddressChangeTarget,
} from "@/schemas/transitions";
import { WebLinkSchema } from "@/schemas/web-link";

// Runtime gates (Wave 2, AD-040): server actions are network-reachable
// endpoints; TS types are erased. Patches are Zod-parsed against the row
// schema's own field shapes and `.strict()` rejects smuggled keys (user_id,
// order_index, confirmed_at, ...) that the raw spread used to pass through.
const UtilityPatchSchema = UtilityTransitionSchema.pick({
  provider: true,
  account_number: true,
  login_url: true,
  phone: true,
  notes: true,
  scheduled_date: true,
  status: true,
  custom_label: true,
})
  .extend({ login_url: WebLinkSchema.nullable() })
  .partial()
  .strict();

const AddressPatchSchema = AddressChangeTargetSchema.pick({
  name: true,
  due_date: true,
  channel: true,
  reference_number: true,
  status: true,
  notes: true,
})
  .partial()
  .strict();

const INVALID_INPUT = "Those details don't look right — try again.";

async function computeAddressDueDate(
  kind: AddressChangeTarget["kind"],
): Promise<string | null> {
  const { moveDate } = await getActiveMoveContext();
  return seededDueDate(moveDate, -ADDRESS_LEAD_DAYS[kind]);
}

// === Utility transitions ===

export async function createUtilityTransition(
  kind: UtilityTransition["kind"],
  side: UtilityTransition["side"],
  customLabel?: string,
): Promise<{ ok: true; row: UtilityTransition } | { ok: false; error: string }> {
  if (
    !UtilityTransitionSchema.shape.kind.safeParse(kind).success ||
    !UtilityTransitionSchema.shape.side.safeParse(side).success ||
    !z.string().max(200).optional().safeParse(customLabel).success
  ) {
    return { ok: false, error: INVALID_INPUT };
  }

  const userId = requireUserId();
  const sb = await createClient();

  // Compute order_index = max(existing for user+side) + 1
  const { data: maxRow, error: maxErr } = await sb
    .from("utility_transitions")
    .select("order_index")
    .eq("user_id", userId)
    .eq("side", side)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) return { ok: false, error: friendlyDbError("createUtilityTransition.read", maxErr) };
  const orderIndex = (maxRow?.order_index ?? -1) + 1;

  const { data, error } = await sb
    .from("utility_transitions")
    .insert({
      user_id: userId,
      kind,
      side,
      status: "needs_action",
      custom_label: customLabel ?? null,
      order_index: orderIndex,
    })
    .select("*")
    .single();
  if (error) return { ok: false, error: friendlyDbError("createUtilityTransition.insert", error) };

  const parsed = UtilityTransitionSchema.parse(data);
  revalidatePath("/transitions");
  revalidatePath("/");
  return { ok: true, row: parsed };
}

export async function updateUtilityTransition(
  id: string,
  rawPatch: Partial<{
    provider: string | null;
    account_number: string | null;
    login_url: string | null;
    phone: string | null;
    notes: string | null;
    scheduled_date: string | null;
    status: UtilityTransition["status"];
    custom_label: string | null;
  }>,
): Promise<{ ok: true; row: UtilityTransition } | { ok: false; error: string }> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: INVALID_INPUT };
  const parsedPatch = UtilityPatchSchema.safeParse(rawPatch);
  if (!parsedPatch.success) return { ok: false, error: INVALID_INPUT };
  const patch = parsedPatch.data;

  const userId = requireUserId();
  const sb = await createClient();

  // SELECT-then-UPDATE so we can decide whether to auto-set confirmed_at.
  const { data: existing, error: getErr } = await sb
    .from("utility_transitions")
    .select("status, confirmed_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (getErr) return { ok: false, error: friendlyDbError("updateUtilityTransition.read", getErr) };
  if (!existing) return { ok: false, error: "That row no longer exists." };

  const update: typeof patch & { confirmed_at?: string | null } = { ...patch };
  if (patch.status === "confirmed" && existing.confirmed_at == null) {
    update.confirmed_at = new Date().toISOString();
  }

  const { data, error } = await sb
    .from("utility_transitions")
    .update(update)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) return { ok: false, error: friendlyDbError("updateUtilityTransition.update", error) };

  const parsed = UtilityTransitionSchema.parse(data);
  revalidatePath("/transitions");
  revalidatePath("/");
  return { ok: true, row: parsed };
}

export async function deleteUtilityTransition(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: INVALID_INPUT };

  const sb = await createClient();
  const { error } = await sb
    .from("utility_transitions")
    .delete()
    .eq("id", id)
    .eq("user_id", requireUserId());
  if (error) return { ok: false, error: friendlyDbError("deleteUtilityTransition", error) };
  revalidatePath("/transitions");
  revalidatePath("/");
  return { ok: true };
}

// === Address change targets ===

export async function createAddressTarget(
  kind: AddressChangeTarget["kind"],
  name: string,
): Promise<{ ok: true; row: AddressChangeTarget } | { ok: false; error: string }> {
  if (!AddressChangeTargetSchema.shape.kind.safeParse(kind).success) {
    return { ok: false, error: INVALID_INPUT };
  }
  // Server-side guard: DB column is text NOT NULL but Postgres accepts empty
  // strings. Reject here so the UI can't insert blank rows.
  if (typeof name !== "string" || name.trim().length === 0 || name.length > 200) {
    return { ok: false, error: "Give this one a name first." };
  }

  const userId = requireUserId();
  const sb = await createClient();

  // Compute order_index = max(existing for user) + 1
  const { data: maxRow, error: maxErr } = await sb
    .from("address_change_targets")
    .select("order_index")
    .eq("user_id", userId)
    .order("order_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) return { ok: false, error: friendlyDbError("createAddressTarget.read", maxErr) };
  const orderIndex = (maxRow?.order_index ?? -1) + 1;

  const dueDate = await computeAddressDueDate(kind);

  const { data, error } = await sb
    .from("address_change_targets")
    .insert({
      user_id: userId,
      kind,
      name: name.trim(),
      due_date: dueDate,
      status: "needs_action",
      order_index: orderIndex,
    })
    .select("*")
    .single();
  if (error) return { ok: false, error: friendlyDbError("createAddressTarget.insert", error) };

  const parsed = AddressChangeTargetSchema.parse(data);
  revalidatePath("/transitions");
  revalidatePath("/");
  return { ok: true, row: parsed };
}

export async function updateAddressTarget(
  id: string,
  rawPatch: Partial<{
    name: string;
    due_date: string | null;
    channel: AddressChangeTarget["channel"];
    reference_number: string | null;
    status: AddressChangeTarget["status"];
    notes: string | null;
  }>,
): Promise<{ ok: true; row: AddressChangeTarget } | { ok: false; error: string }> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: INVALID_INPUT };
  const parsedPatch = AddressPatchSchema.safeParse(rawPatch);
  if (!parsedPatch.success) return { ok: false, error: INVALID_INPUT };
  const patch = parsedPatch.data;

  const userId = requireUserId();
  const sb = await createClient();

  // SELECT-then-UPDATE so we can decide whether to auto-set submitted_at /
  // confirmed_at on the relevant status transitions.
  const { data: existing, error: getErr } = await sb
    .from("address_change_targets")
    .select("status, submitted_at, confirmed_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (getErr) return { ok: false, error: friendlyDbError("updateAddressTarget.read", getErr) };
  if (!existing) return { ok: false, error: "That row no longer exists." };

  const update: typeof patch & {
    submitted_at?: string | null;
    confirmed_at?: string | null;
  } = { ...patch };
  if (patch.status === "submitted" && existing.submitted_at == null) {
    update.submitted_at = new Date().toISOString();
  }
  if (patch.status === "confirmed" && existing.confirmed_at == null) {
    update.confirmed_at = new Date().toISOString();
  }

  const { data, error } = await sb
    .from("address_change_targets")
    .update(update)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) return { ok: false, error: friendlyDbError("updateAddressTarget.update", error) };

  const parsed = AddressChangeTargetSchema.parse(data);
  revalidatePath("/transitions");
  revalidatePath("/");
  return { ok: true, row: parsed };
}

export async function deleteAddressTarget(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: INVALID_INPUT };

  const sb = await createClient();
  const { error } = await sb
    .from("address_change_targets")
    .delete()
    .eq("id", id)
    .eq("user_id", requireUserId());
  if (error) return { ok: false, error: friendlyDbError("deleteAddressTarget", error) };
  revalidatePath("/transitions");
  revalidatePath("/");
  return { ok: true };
}
