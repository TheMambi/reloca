import "server-only";
import { cache } from "react";
import { createClient, requireUserId } from "@/lib/supabase/server";
import { daysUntilIso } from "@/lib/dates";
import {
  LeaseTermsSchema,
  LeaseEventSchema,
  NoticeDraftSchema,
  DestinationSchema,
  InsurancePolicySchema,
  coerceNumerics,
  type LeaseTerms,
  type LeaseEvent,
  type NoticeDraft,
  type Destination,
  type InsurancePolicy,
} from "@/schemas/lease";

// PostgREST returns numeric() columns as strings; Zod's z.number() rejects
// strings, so each row must be coerced before parse. The constants below
// enumerate the numeric columns for each table.
const LEASE_NUMERIC_FIELDS = [
  "current_monthly_rent",
  "renewal_monthly_rent",
  "m2m_premium",
  "security_deposit",
  "pet_rent_monthly",
  "parking_monthly",
  "origin_lat",
  "origin_lng",
] as const;

const DESTINATION_NUMERIC_FIELDS = [
  "monthly_rent_low",
  "monthly_rent_high",
  "application_fee",
  "security_deposit",
  "pet_rent_monthly",
  "parking_monthly",
  "beds",
  "baths",
  "hud_fmr_2br",
  "insurance_min_liability",
  "insurance_min_property",
  "lat",
  "lng",
] as const;

const INSURANCE_NUMERIC_FIELDS = [
  "liability_amount",
  "personal_property_amount",
  "monthly_cost",
] as const;

export const getActiveLease = cache(async (): Promise<LeaseTerms | null> => {
  const sb = await createClient();
  const { data, error } = await sb
    .from("lease_terms")
    .select("*")
    .eq("user_id", requireUserId())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getActiveLease: ${error.message}`);
  if (!data) return null;
  return LeaseTermsSchema.parse(coerceNumerics(data, LEASE_NUMERIC_FIELDS));
});

export const getLeaseEvents = cache(async (leaseId: string): Promise<LeaseEvent[]> => {
  const sb = await createClient();
  const { data, error } = await sb
    .from("lease_events")
    .select("*")
    .eq("user_id", requireUserId())
    .eq("lease_id", leaseId)
    .order("occurs_on", { ascending: true });
  if (error) throw new Error(`getLeaseEvents: ${error.message}`);
  return LeaseEventSchema.array().parse(data ?? []);
});

export const getLatestNoticeDraft = cache(async (leaseId: string): Promise<NoticeDraft | null> => {
  const sb = await createClient();
  const { data, error } = await sb
    .from("notice_drafts")
    .select("*")
    .eq("user_id", requireUserId())
    .eq("lease_id", leaseId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getLatestNoticeDraft: ${error.message}`);
  if (!data) return null;
  return NoticeDraftSchema.parse(data);
});

export const getDestinations = cache(async (): Promise<Destination[]> => {
  const sb = await createClient();
  const { data, error } = await sb
    .from("destinations")
    .select("*")
    .eq("user_id", requireUserId())
    .order("created_at", { ascending: false });
  if (error) throw new Error(`getDestinations: ${error.message}`);
  const rows = (data ?? []).map((row) => coerceNumerics(row, DESTINATION_NUMERIC_FIELDS));
  return DestinationSchema.array().parse(rows);
});

export const getActiveDestination = cache(async (): Promise<Destination | null> => {
  const sb = await createClient();
  const { data, error } = await sb
    .from("destinations")
    .select("*")
    .eq("user_id", requireUserId())
    .eq("is_active_target", true)
    .maybeSingle();
  if (error) throw new Error(`getActiveDestination: ${error.message}`);
  if (!data) return null;
  return DestinationSchema.parse(coerceNumerics(data, DESTINATION_NUMERIC_FIELDS));
});

export const getInsurancePolicies = cache(async (): Promise<InsurancePolicy[]> => {
  const sb = await createClient();
  const { data, error } = await sb
    .from("insurance_policies")
    .select("*")
    .eq("user_id", requireUserId())
    .order("scope", { ascending: true })
    .order("effective_from", { ascending: true });
  if (error) throw new Error(`getInsurancePolicies: ${error.message}`);
  const rows = (data ?? []).map((row) => coerceNumerics(row, INSURANCE_NUMERIC_FIELDS));
  return InsurancePolicySchema.array().parse(rows);
});

export interface LeaseStatus {
  exists: boolean;
  decision: LeaseTerms["decision"] | null;
  noticeSent: boolean;
  daysUntilSendBy: number | null;
  noticeSendByDate: string | null;
  leaseEndDate: string | null;
}

export const getLeaseStatus = cache(async (): Promise<LeaseStatus> => {
  const lease = await getActiveLease();
  if (!lease) {
    return {
      exists: false,
      decision: null,
      noticeSent: false,
      daysUntilSendBy: null,
      noticeSendByDate: null,
      leaseEndDate: null,
    };
  }
  const events = await getLeaseEvents(lease.id);
  const noticeSent = events.some((e) => e.kind === "notice_sent");
  const sendByEvent = events.find((e) => e.kind === "notice_send_by");
  const sendByIso = sendByEvent?.occurs_on ?? null;
  const days = daysUntilIso(sendByIso);
  return {
    exists: true,
    decision: lease.decision,
    noticeSent,
    daysUntilSendBy: days,
    noticeSendByDate: sendByIso,
    leaseEndDate: lease.lease_end_date,
  };
});
