"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import {
  createClient,
  createAdminClient,
  isDemoMode,
  requireUserId,
} from "@/lib/supabase/server";
import { recomputeDestinationOverlays } from "@/lib/lease/overlays";
import { isoDateInZone } from "@/lib/dates";
import { clientKey, createRateLimiter } from "@/lib/rate-limit";
import {
  buildLeaseTasks,
  depositDeadline,
  noticeSendByDate,
} from "@/lib/lease/lease-tasks";
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

  // Follow-ups, idempotent and serial. There is no transaction across them,
  // so a failure removes the new lease again: a retry would otherwise leave
  // two leases behind.
  try {
    await recomputeLeaseEvents(data.id);
    await seedLeaseChecklistTasks(data.id);
  } catch (err) {
    await sb.from("lease_terms").delete().eq("id", data.id).eq("user_id", userId);
    throw err;
  }

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
  if (LEASE_TASK_FIELDS.some((field) => field in parsed)) {
    await refreshLeaseChecklistTasks(leaseId);
  }
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

// Lease fields the checklist tasks are computed from.
const LEASE_TASK_FIELDS = [
  "city",
  "lease_end_date",
  "notice_days_required",
  "target_move_out_date",
] as const;

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

  // 2. Note the derived rows to replace. They are deleted only after the new
  // set is in, so a failed insert never leaves the lease without a deadline.
  const { data: stale, error: staleErr } = await admin
    .from("lease_events")
    .select("id")
    .eq("lease_id", leaseId)
    .eq("user_id", userId)
    .in("kind", [...DERIVED_EVENT_KINDS]);
  if (staleErr) throw new Error(`recomputeLeaseEvents.read: ${staleErr.message}`);

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
  const sendBy = noticeSendByDate(lease);
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
  }
  // Only for a state whose deposit rule is on file (lib/lease/deposit-rules.ts).
  const depositBy = depositDeadline(lease);
  if (depositBy) {
    inserts.push({
      user_id: userId,
      lease_id: leaseId,
      kind: "deposit_claim_window_end",
      occurs_on: depositBy,
      status: "pending",
    });
  }

  // 4. Insert
  const { error: insErr } = await admin.from("lease_events").insert(inserts);
  if (insErr) throw new Error(`recomputeLeaseEvents.insert: ${insErr.message}`);

  // 5. Delete the rows the new set replaces
  const staleIds = (stale ?? []).map((row) => row.id);
  if (staleIds.length > 0) {
    const { error: delErr } = await admin
      .from("lease_events")
      .delete()
      .eq("user_id", userId)
      .in("id", staleIds);
    if (delErr) throw new Error(`recomputeLeaseEvents.delete: ${delErr.message}`);
  }
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

  // Two writes, no transaction. Each is skipped when already done, so calling
  // again after a failure between them finishes the job instead of returning
  // early with the draft locked and no event.
  const sentAt = draft.sent_at ?? new Date().toISOString();
  if (!draft.sent_at) {
    const { error: updErr } = await sb
      .from("notice_drafts")
      .update({ sent_at: sentAt })
      .eq("id", draftId)
      .eq("user_id", userId);
    if (updErr) throw new Error(`markNoticeSent.update: ${updErr.message}`);
  }

  const { data: recorded, error: evReadErr } = await sb
    .from("lease_events")
    .select("id")
    .eq("user_id", userId)
    .eq("lease_id", draft.lease_id)
    .eq("kind", "notice_sent")
    .limit(1);
  if (evReadErr) throw new Error(`markNoticeSent.eventRead: ${evReadErr.message}`);
  if ((recorded ?? []).length === 0) {
    const { error: evErr } = await sb.from("lease_events").insert({
      user_id: userId,
      lease_id: draft.lease_id,
      kind: "notice_sent",
      // The calendar day in the household's zone: an evening send in the US is
      // already tomorrow in UTC, and would be recorded as a day late.
      occurs_on: isoDateInZone(new Date(sentAt)),
      status: "done",
    });
    if (evErr) throw new Error(`markNoticeSent.event: ${evErr.message}`);
  }

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

  const seeds = buildLeaseTasks(lease);

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

// Lease tasks have no edit control in the checklist, so after a lease edit
// their titles, notes and due dates are rewritten here from the fresh lease.
// A task is recognized by its position and title; anything else is left alone.
async function refreshLeaseChecklistTasks(leaseId: string): Promise<void> {
  const userId = requireUserId();
  const admin = createAdminClient();

  const { data: lease, error: leaseErr } = await admin
    .from("lease_terms")
    .select("*")
    .eq("id", leaseId)
    .eq("user_id", userId)
    .maybeSingle();
  if (leaseErr) throw new Error(`refreshLeaseChecklistTasks.lease: ${leaseErr.message}`);
  if (!lease) throw new Error(`refreshLeaseChecklistTasks: lease ${leaseId} not found`);

  const { data: rows, error: readErr } = await admin
    .from("checklist_items")
    .select("id, title, order_index")
    .eq("user_id", userId)
    .eq("category", "lease");
  if (readErr) throw new Error(`refreshLeaseChecklistTasks.read: ${readErr.message}`);

  for (const task of buildLeaseTasks(lease)) {
    const row = (rows ?? []).find(
      (r) =>
        r.order_index === task.order_index &&
        (task.titlePattern ? task.titlePattern.test(r.title) : r.title === task.title),
    );
    if (!row) continue;
    const { error: updErr } = await admin
      .from("checklist_items")
      .update({ title: task.title, description: task.description, due_date: task.due_date })
      .eq("id", row.id)
      .eq("user_id", userId);
    if (updErr) throw new Error(`refreshLeaseChecklistTasks.update: ${updErr.message}`);
  }
  revalidatePath("/checklist");
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

const ADDRESS_FIELDS = ["street_address", "city", "state_code", "zip_code"] as const;

export async function updateDestination(
  id: string,
  patch: z.input<typeof DestinationPatchInput>,
): Promise<void> {
  const parsed = DestinationPatchInput.parse(patch);
  const sb = await createClient();

  // The edit dialog sends the address fields on every save, so "present in the
  // patch" does not mean "changed". Compare against the stored row.
  const { data: before, error: beforeErr } = await sb
    .from("destinations")
    .select("street_address, city, state_code, zip_code")
    .eq("id", id)
    .eq("user_id", requireUserId())
    .maybeSingle();
  if (beforeErr) throw new Error(`updateDestination.read: ${beforeErr.message}`);

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
  const addressChanged = ADDRESS_FIELDS.some(
    (field) => parsed[field] !== undefined && parsed[field] !== before?.[field],
  );
  if (addressTouched) {
    try {
      await recomputeDestinationOverlays(id, { addressChanged });
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
// the dialog can call it via a server action without exposing cheerio and the
// network code to the client bundle. Returns the parsed shape; insertion is
// deferred to Phase 2 (the user reviews + edits before commit).
// Each call makes outbound requests on the caller's say-so.
const previewLimiter = createRateLimiter(5, 60_000);

export async function fetchDestinationPreview(
  url: string,
): Promise<FetchResult> {
  if (!previewLimiter.allow(clientKey(await headers()))) {
    return {
      status: "fetch_failed",
      message: "That's a lot of links in a short time. Wait a minute and try again.",
    };
  }
  // The public demo has no sign-in, so it must not fetch arbitrary URLs.
  if (isDemoMode()) {
    return {
      status: "fetch_failed",
      message: "Link previews are turned off in the demo. Fill in the details by hand.",
    };
  }
  return fetchDestinationFromUrl(url);
}
