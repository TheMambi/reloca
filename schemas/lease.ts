import { z } from "zod";

export const ResidentSchema = z.object({
  name: z.string().min(1),
  email: z.email().optional(),
  isPrimary: z.boolean().default(false),
});
export type Resident = z.infer<typeof ResidentSchema>;

export const LeaseDecisionEnum = z.enum(["undecided", "renew", "vacate", "m2m"]);

export const LeaseTermsSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  property_name: z.string().min(1),
  unit_address: z.string().min(1),
  city: z.string().min(1),
  landlord_email: z.email(),
  landlord_display_name: z.string().nullable(),
  residents: z.array(ResidentSchema).min(1),
  lease_start_date: z.iso.date(),
  lease_end_date: z.iso.date(),
  notice_days_required: z.number().int().min(0),
  target_move_out_date: z.iso.date().nullable(),
  renewal_offer_expires: z.iso.date().nullable(),
  current_monthly_rent: z.number().nonnegative(),
  renewal_monthly_rent: z.number().nonnegative().nullable(),
  m2m_premium: z.number().nonnegative(),
  security_deposit: z.number().nonnegative().nullable(),
  pet_rent_monthly: z.number().nonnegative(),
  parking_monthly: z.number().nonnegative(),
  included_utilities: z.array(z.string()),
  late_fee_rules: z.string().nullable(),
  decision: LeaseDecisionEnum,
  origin_lat: z.number().nullable(),
  origin_lng: z.number().nullable(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});
export type LeaseTerms = z.infer<typeof LeaseTermsSchema>;

export const LeaseEventKindEnum = z.enum([
  "notice_send_by",
  "renewal_offer_expires",
  "lease_end",
  "target_move_out",
  "notice_sent",
  "walkthrough",
  "key_return",
  "deposit_claim_window_end",
]);
export const LeaseEventStatusEnum = z.enum(["pending", "active", "done", "missed"]);

export const LeaseEventSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  lease_id: z.uuid(),
  kind: LeaseEventKindEnum,
  occurs_on: z.iso.date(),
  status: LeaseEventStatusEnum,
  notes: z.string().nullable(),
  created_at: z.iso.datetime({ offset: true }),
});
export type LeaseEvent = z.infer<typeof LeaseEventSchema>;

export const NoticeDraftSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  lease_id: z.uuid(),
  body_markdown: z.string().min(1),
  body_plaintext: z.string().min(1),
  subject_line: z.string().min(1),
  recipient_email: z.email(),
  move_out_date: z.iso.date(),
  created_at: z.iso.datetime({ offset: true }),
  sent_at: z.iso.datetime({ offset: true }).nullable(),
});
export type NoticeDraft = z.infer<typeof NoticeDraftSchema>;

export const FetchStatusEnum = z.enum(["manual", "needs_review", "verified", "fetch_failed"]);

export const DestinationSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  // Per-relocation scoping hook (0021). Nullable + optional: column live +
  // backfilled by 0023, but no read path filters on it yet (AD-041).
  relocation_id: z.uuid().nullable().optional(),
  building_name: z.string().min(1),
  street_address: z.string().min(1),
  city: z.string().min(1),
  state_code: z.string().regex(/^[A-Z]{2}$/).nullable(),
  zip_code: z.string().regex(/^\d{5}(-\d{4})?$/).nullable(),
  source_url: z.url().nullable(),
  fetch_status: FetchStatusEnum,
  fetched_at: z.iso.datetime({ offset: true }).nullable(),
  monthly_rent_low: z.number().nonnegative().nullable(),
  monthly_rent_high: z.number().nonnegative().nullable(),
  application_fee: z.number().nonnegative().nullable(),
  security_deposit: z.number().nonnegative().nullable(),
  pet_rent_monthly: z.number().nonnegative().nullable(),
  parking_monthly: z.number().nonnegative().nullable(),
  beds: z.number().nonnegative().nullable(),
  baths: z.number().nonnegative().nullable(),
  sqft: z.number().int().nullable(),
  amenities: z.array(z.string()),
  pets_allowed: z.boolean().nullable(),
  furnished: z.boolean().nullable(),
  hud_fmr_2br: z.number().nonnegative().nullable(),
  hud_fmr_year: z.number().int().nullable(),
  walk_score: z.number().int().min(0).max(100).nullable(),
  transit_score: z.number().int().min(0).max(100).nullable(),
  bike_score: z.number().int().min(0).max(100).nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  insurance_required: z.boolean(),
  insurance_min_liability: z.number().nonnegative().nullable(),
  insurance_min_property: z.number().nonnegative().nullable(),
  is_active_target: z.boolean(),
  notes: z.string().nullable(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});
export type Destination = z.infer<typeof DestinationSchema>;

export const InsuranceScopeEnum = z.enum(["origin", "destination"]);

export const InsurancePolicySchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  scope: InsuranceScopeEnum,
  property_label: z.string().min(1),
  carrier: z.string().nullable(),
  policy_number: z.string().nullable(),
  liability_amount: z.number().nonnegative(),
  personal_property_amount: z.number().nonnegative(),
  monthly_cost: z.number().nonnegative().nullable(),
  effective_from: z.iso.date(),
  effective_to: z.iso.date().nullable(),
  interested_party_listed: z.boolean(),
  interested_party_name: z.string().nullable(),
  document_url: z.url().nullable(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});
export type InsurancePolicy = z.infer<typeof InsurancePolicySchema>;

// PostgREST returns numeric() as string. Use this before parsing rows.
export function coerceNumerics<T extends Record<string, unknown>>(row: T, fields: readonly (keyof T)[]): T {
  const out = { ...row };
  for (const f of fields) {
    const v = out[f];
    if (typeof v === "string" && v.length > 0) {
      (out as Record<keyof T, unknown>)[f] = Number(v);
    }
  }
  return out;
}
