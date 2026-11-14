"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  createClient,
  createAdminClient,
  isDemoMode,
  requireUserId,
} from "@/lib/supabase/server";
import { recomputeDestinationOverlays } from "@/lib/lease/overlays";
import {
  fetchDestinationFromUrl,
  type FetchResult,
} from "@/lib/lease/destination-fetch";
import {
  LeaseDecisionEnum,
  NoticeDraftSchema,
  CreateLeaseTermsInput,
  UpdateLeaseTermsPatch,
  InsurancePolicyCreateInput,
  InsurancePolicyPatchInput,
  DestinationCreateInput,
  DestinationPatchInput,
  type NoticeDraft,
} from "@/schemas/lease";

// Lease task offsets (days). Mostly statutory or operational defaults.
const CO_DEPOSIT_RETURN_DAYS = 60;        // CO statute: itemized deposit return within 60 days
const INSURANCE_LEAD_BEFORE_LEASE_END = 14;
const DESTINATION_INSURANCE_LEAD = 7;
const ORIGIN_POLICY_CANCEL_OFFSET = 7;    // days after move-out
const CONDITION_DOC_LEAD = 3;             // days before move-out

// ── lease_terms CRUD ──────────────────────────────────────────────────────

export async function createLeaseTerms(
  input: z.input<typeof CreateLeaseTermsInput>,
): Promise<{ id: string }> {
  const parsed = CreateLeaseTermsInput.parse(input);
  const userId = requireUserId();
  const sb = await createClient();
  const { data, error } = await sb
    .from("lease_terms")
    .insert({ ...parsed, user_id: userId })
    .select("id")
    .single();
  if (error) throw new Error(`createLeaseTerms: ${error.message}`);

  // 3 follow-ups, all idempotent and serial:
  await recomputeLeaseEvents(data.id);
  await seedLeaseChecklistTasks(data.id);

  revalidatePath("/lease");
  revalidatePath("/");
  return { id: data.id };
}

export async function updateLeaseTerms(
  leaseId: string,
  patch: z.input<typeof UpdateLeaseTermsPatch>,
): Promise<void> {
  const parsed = UpdateLeaseTermsPatch.parse(patch);
  const sb = await createClient();
  const { error } = await sb
    .from("lease_terms")
    .update(parsed)
    .eq("id", leaseId)
    .eq("user_id", requireUserId());
  if (error) throw new Error(`updateLeaseTerms: ${error.message}`);
  await recomputeLeaseEvents(leaseId);
  revalidatePath("/lease");
  revalidatePath("/");
}

export async function updateLeaseDecision(
  leaseId: string,
  decision: z.infer<typeof LeaseDecisionEnum>,
): Promise<void> {
  // Validate decision via the enum
  LeaseDecisionEnum.parse(decision);
  await updateLeaseTerms(leaseId, { decision });
}

// ── derived events ────────────────────────────────────────────────────────

const DERIVED_EVENT_KINDS = [
  "notice_send_by",
  "renewal_offer_expires",
  "lease_end",
  "target_move_out",
  "deposit_claim_window_end",
] as const;

export async function recomputeLeaseEvents(leaseId: string): Promise<void> {
  const userId = requireUserId();
  const admin = createAdminClient();

  // 1. Load lease
  const { data: lease, error: leaseErr } = await admin
    .from("lease_terms")
    .select("*")
    .eq("id", leaseId)
    .eq("user_id", userId)
    .maybeSingle();
  if (leaseErr) throw new Error(`recomputeLeaseEvents.load: ${leaseErr.message}`);
  if (!lease) throw new Error(`recomputeLeaseEvents: lease ${leaseId} not found`);

  // 2. Delete derived rows
  const { error: delErr } = await admin
    .from("lease_events")
    .delete()
    .eq("lease_id", leaseId)
    .eq("user_id", userId)
    .in("kind", [...DERIVED_EVENT_KINDS]);
  if (delErr) throw new Error(`recomputeLeaseEvents.delete: ${delErr.message}`);

  // 3. Build new derived rows
  type DerivedKind = (typeof DERIVED_EVENT_KINDS)[number];
  const inserts: {
    user_id: string;
    lease_id: string;
    kind: DerivedKind;
    occurs_on: string;
    status: "pending";
  }[] = [];

  // notice_send_by = lease_end - notice_days_required
  const sendBy = subtractDays(lease.lease_end_date, lease.notice_days_required);
  inserts.push({
    user_id: userId,
    lease_id: leaseId,
    kind: "notice_send_by",
    occurs_on: sendBy,
    status: "pending",
  });

  inserts.push({
    user_id: userId,
    lease_id: leaseId,
    kind: "lease_end",
    occurs_on: lease.lease_end_date,
    status: "pending",
  });

  if (lease.renewal_offer_expires) {
    inserts.push({
      user_id: userId,
      lease_id: leaseId,
      kind: "renewal_offer_expires",
      occurs_on: lease.renewal_offer_expires,
      status: "pending",
    });
  }
  if (lease.target_move_out_date) {
    inserts.push({
      user_id: userId,
      lease_id: leaseId,
      kind: "target_move_out",
      occurs_on: lease.target_move_out_date,
      status: "pending",
    });
    // CO statute default: itemized deposit return within CO_DEPOSIT_RETURN_DAYS of move-out
    inserts.push({
      user_id: userId,
      lease_id: leaseId,
      kind: "deposit_claim_window_end",
      occurs_on: addDays(lease.target_move_out_date, CO_DEPOSIT_RETURN_DAYS),
      status: "pending",
    });
  }

  // 4. Insert
  const { error: insErr } = await admin.from("lease_events").insert(inserts);
  if (insErr) throw new Error(`recomputeLeaseEvents.insert: ${insErr.message}`);
}

// Pure date helpers (UTC arithmetic, ISO date in/out).
function subtractDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── notice_drafts ─────────────────────────────────────────────────────────

const NoticeDraftCreateInput = z.object({
  body_markdown: z.string().min(1),
  body_plaintext: z.string().min(1),
  subject_line: z.string().min(1),
  recipient_email: z.email(),
  move_out_date: z.iso.date(),
});

export async function createNoticeDraft(
  leaseId: string,
  input: z.input<typeof NoticeDraftCreateInput>,
): Promise<NoticeDraft> {
  const parsed = NoticeDraftCreateInput.parse(input);
  const userId = requireUserId();
  const sb = await createClient();
  const { data, error } = await sb
    .from("notice_drafts")
    .insert({ ...parsed, lease_id: leaseId, user_id: userId })
    .select("*")
    .single();
  if (error) throw new Error(`createNoticeDraft: ${error.message}`);
  revalidatePath("/lease");
  return NoticeDraftSchema.parse(data);
}

const NoticeDraftPatchInput = NoticeDraftCreateInput.partial();

export async function updateNoticeDraft(
  draftId: string,
  patch: z.input<typeof NoticeDraftPatchInput>,
): Promise<{ ok: true } | { ok: false; reason: "locked" }> {
  const parsed = NoticeDraftPatchInput.parse(patch);
  const userId = requireUserId();
  const sb = await createClient();
  // Read first to check lock state.
  const { data: existing, error: getErr } = await sb
    .from("notice_drafts")
    .select("sent_at")
    .eq("id", draftId)
    .eq("user_id", userId)
    .maybeSingle();
  if (getErr) throw new Error(`updateNoticeDraft.read: ${getErr.message}`);
  if (!existing) throw new Error(`updateNoticeDraft: draft ${draftId} not found`);
  if (existing.sent_at) return { ok: false, reason: "locked" };

  const { error: updErr } = await sb
    .from("notice_drafts")
    .update(parsed)
    .eq("id", draftId)
    .eq("user_id", userId);
  if (updErr) throw new Error(`updateNoticeDraft.update: ${updErr.message}`);
  revalidatePath("/lease");
  return { ok: true };
}

export async function markNoticeSent(draftId: string): Promise<void> {
  const userId = requireUserId();
  const sb = await createClient();

  // 1. Load draft to get the lease_id (for the event row)
  const { data: draft, error: getErr } = await sb
    .from("notice_drafts")
    .select("lease_id, sent_at")
    .eq("id", draftId)
    .eq("user_id", userId)
    .maybeSingle();
  if (getErr) throw new Error(`markNoticeSent.read: ${getErr.message}`);
  if (!draft) throw new Error(`markNoticeSent: draft ${draftId} not found`);
  if (draft.sent_at) return; // already sent — idempotent

  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);

  const { error: updErr } = await sb
    .from("notice_drafts")
    .update({ sent_at: nowIso })
    .eq("id", draftId)
    .eq("user_id", userId);
  if (updErr) throw new Error(`markNoticeSent.update: ${updErr.message}`);

  const { error: evErr } = await sb.from("lease_events").insert({
    user_id: userId,
    lease_id: draft.lease_id,
    kind: "notice_sent",
    occurs_on: today,
    status: "done",
  });
  if (evErr) throw new Error(`markNoticeSent.event: ${evErr.message}`);

  await recomputeLeaseEvents(draft.lease_id);
  revalidatePath("/lease");
  revalidatePath("/");
}

// ── checklist crossover ───────────────────────────────────────────────────

export async function seedLeaseChecklistTasks(leaseId: string): Promise<void> {
  const userId = requireUserId();
  const admin = createAdminClient();

  // Idempotent: if any lease-category row already exists for this user, exit
  const { count, error: cntErr } = await admin
    .from("checklist_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("category", "lease");
  if (cntErr) throw new Error(`seedLeaseChecklistTasks.count: ${cntErr.message}`);
  if ((count ?? 0) > 0) return;

  // Load lease to compute due dates
  const { data: lease, error: leaseErr } = await admin
    .from("lease_terms")
    .select("*")
    .eq("id", leaseId)
    .eq("user_id", userId)
    .maybeSingle();
  if (leaseErr) throw new Error(`seedLeaseChecklistTasks.lease: ${leaseErr.message}`);
  if (!lease) throw new Error(`seedLeaseChecklistTasks: lease ${leaseId} not found`);

  const moveOut = lease.target_move_out_date ?? lease.lease_end_date;
  const noticeSendBy = subtractDays(lease.lease_end_date, lease.notice_days_required);

  type Seed = {
    title: string;
    description: string | null;
    due_date: string;
    order_index: number;
  };
  const seeds: Seed[] = [
    {
      title: "Send 60-day notice to vacate",
      description:
        "Reply to renewal email with last-day-in-apartment date. Generated by /lease notice composer.",
      due_date: noticeSendBy,
      order_index: 0,
    },
    {
      title: "Confirm origin renter's insurance to lease end",
      description:
        "Keep coverage active through lease end and list your landlord as an interested party if the lease requires it.",
      due_date: subtractDays(lease.lease_end_date, INSURANCE_LEAD_BEFORE_LEASE_END),
      order_index: 1,
    },
    {
      title: "Set up destination renter's insurance",
      description:
        "Coverage starts on or before move-out date. Liability/property minimums per destination requirements.",
      due_date: subtractDays(moveOut, DESTINATION_INSURANCE_LEAD),
      order_index: 2,
    },
    {
      title: "Cancel/transfer origin policy",
      description: "Avoid double-billing after move-out.",
      due_date: addDays(moveOut, ORIGIN_POLICY_CANCEL_OFFSET),
      order_index: 3,
    },
    {
      title: "Document apartment condition (photo + video)",
      description: "Move-out walkthrough — protects deposit recovery.",
      due_date: subtractDays(moveOut, CONDITION_DOC_LEAD),
      order_index: 4,
    },
    {
      title: "Return keys + provide forwarding address",
      description: "Confirms move-out per landlord procedure.",
      due_date: moveOut,
      order_index: 5,
    },
    {
      title: "Track deposit return",
      description: "Colorado: landlord must itemize within 60 days of move-out.",
      due_date: addDays(moveOut, CO_DEPOSIT_RETURN_DAYS),
      order_index: 6,
    },
  ];

  const rows = seeds.map((s) => ({
    user_id: userId,
    category: "lease" as const,
    completed: false,
    title: s.title,
    description: s.description,
    due_date: s.due_date,
    order_index: s.order_index,
  }));

  const { error: insErr } = await admin.from("checklist_items").insert(rows);
  if (insErr) throw new Error(`seedLeaseChecklistTasks.insert: ${insErr.message}`);

  revalidatePath("/checklist");
  revalidatePath("/lease");
  revalidatePath("/");
}

// ── insurance_policies CRUD ───────────────────────────────────────────────

export async function addInsurancePolicy(
  input: z.input<typeof InsurancePolicyCreateInput>,
): Promise<{ id: string }> {
  const parsed = InsurancePolicyCreateInput.parse(input);
  const userId = requireUserId();
  const sb = await createClient();
  const { data, error } = await sb
    .from("insurance_policies")
    .insert({ ...parsed, user_id: userId })
    .select("id")
    .single();
  if (error) throw new Error(`addInsurancePolicy: ${error.message}`);
  revalidatePath("/lease");
  revalidatePath("/");
  return { id: data.id };
}

export async function updateInsurancePolicy(
  id: string,
  patch: z.input<typeof InsurancePolicyPatchInput>,
): Promise<void> {
  const parsed = InsurancePolicyPatchInput.parse(patch);
  const sb = await createClient();
  const { error } = await sb
    .from("insurance_policies")
    .update(parsed)
    .eq("id", id)
    .eq("user_id", requireUserId());
  if (error) throw new Error(`updateInsurancePolicy: ${error.message}`);
  revalidatePath("/lease");
  revalidatePath("/");
}

export async function deleteInsurancePolicy(id: string): Promise<void> {
  const sb = await createClient();
  const { error } = await sb
    .from("insurance_policies")
    .delete()
    .eq("id", id)
    .eq("user_id", requireUserId());
  if (error) throw new Error(`deleteInsurancePolicy: ${error.message}`);
  revalidatePath("/lease");
  revalidatePath("/");
}

// ── destinations CRUD (Wave B uses these heavily) ─────────────────────────

export async function createDestination(
  input: z.input<typeof DestinationCreateInput>,
): Promise<{ id: string }> {
  const parsed = DestinationCreateInput.parse(input);
  const userId = requireUserId();
  const sb = await createClient();

  // If this row will be active, flip all others off first (so the partial unique
  // index `idx_destinations_one_active` doesn't reject the insert).
  if (parsed.is_active_target) {
    const { error: flipErr } = await sb
      .from("destinations")
      .update({ is_active_target: false })
      .eq("user_id", userId)
      .eq("is_active_target", true);
    if (flipErr) throw new Error(`createDestination.flip: ${flipErr.message}`);
  }

  const { data, error } = await sb
    .from("destinations")
    .insert({ ...parsed, user_id: userId })
    .select("id")
    .single();
  if (error) throw new Error(`createDestination.insert: ${error.message}`);

  // Overlay refresh is best-effort — a HUD timeout shouldn't block the row
  // from existing. The columns stay null and a future "Refresh" action can
  // retry. Log to server stderr so we still notice repeated failures.
  try {
    await recomputeDestinationOverlays(data.id);
  } catch (err) {
    console.error("createDestination.overlays:", err);
  }

  revalidatePath("/lease");
  revalidatePath("/");
  return { id: data.id };
}

export async function setActiveDestination(destinationId: string): Promise<void> {
  const userId = requireUserId();
  const sb = await createClient();

  // 1. Flip all active off for this user
  const { error: flipErr } = await sb
    .from("destinations")
    .update({ is_active_target: false })
    .eq("user_id", userId)
    .eq("is_active_target", true);
  if (flipErr) throw new Error(`setActiveDestination.flip: ${flipErr.message}`);

  // 2. Set the chosen one active
  const { error: setErr } = await sb
    .from("destinations")
    .update({ is_active_target: true })
    .eq("id", destinationId)
    .eq("user_id", userId);
  if (setErr) throw new Error(`setActiveDestination.set: ${setErr.message}`);

  revalidatePath("/lease");
  revalidatePath("/");
}

export async function updateDestination(
  id: string,
  patch: z.input<typeof DestinationPatchInput>,
): Promise<void> {
  const parsed = DestinationPatchInput.parse(patch);
  const sb = await createClient();

  // If patch sets is_active_target to true, flip others off first
  if (parsed.is_active_target === true) {
    const userId = requireUserId();
    const { error: flipErr } = await sb
      .from("destinations")
      .update({ is_active_target: false })
      .eq("user_id", userId)
      .eq("is_active_target", true)
      .neq("id", id);
    if (flipErr) throw new Error(`updateDestination.flip: ${flipErr.message}`);
  }

  const { error } = await sb
    .from("destinations")
    .update(parsed)
    .eq("id", id)
    .eq("user_id", requireUserId());
  if (error) throw new Error(`updateDestination: ${error.message}`);

  // Re-run overlays whenever the address could have changed (street / city /
  // state / zip), AND whenever the row is missing the benchmark — covers the
  // case where the original create/update never wrote one (e.g. zip was
  // empty back then) and the user just filled it in via edit.
  const addressTouched =
    parsed.street_address !== undefined ||
    parsed.city !== undefined ||
    parsed.state_code !== undefined ||
    parsed.zip_code !== undefined;
  if (addressTouched) {
    try {
      await recomputeDestinationOverlays(id);
    } catch (err) {
      console.error("updateDestination.overlays:", err);
    }
  }

  revalidatePath("/lease");
  revalidatePath("/");
}

export async function deleteDestination(id: string): Promise<void> {
  const sb = await createClient();
  const { error } = await sb
    .from("destinations")
    .delete()
    .eq("id", id)
    .eq("user_id", requireUserId());
  if (error) throw new Error(`deleteDestination: ${error.message}`);
  revalidatePath("/lease");
  revalidatePath("/");
}

// "+ Add destination" Phase 1 (Task 6.25). Wraps fetchDestinationFromUrl so
// the dialog can call it via a server action without exposing cheerio +
// node:dns to the client bundle. Returns the parsed shape; insertion is
// deferred to Phase 2 (the user reviews + edits before commit).
export async function fetchDestinationPreview(
  url: string,
): Promise<FetchResult> {
  // The public demo has no sign-in, so it must not fetch arbitrary URLs.
  if (isDemoMode()) {
    return {
      status: "fetch_failed",
      message: "Link previews are turned off in the demo. Fill in the details by hand.",
    };
  }
  return fetchDestinationFromUrl(url);
}
