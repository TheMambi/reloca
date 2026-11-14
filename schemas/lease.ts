import { z } from "zod";
import { WEB_LINK_MAX, WebLinkSchema } from "./web-link";

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

// ── Action inputs (app/lease/actions.ts) ──────────────────────────────────
// The editable fields are picked from the row schemas, which carry no defaults.
// Zod fills a default for every missing key, even inside .partial(), so a patch
// schema built from a shape with defaults resets fields the caller never sent.
// Defaults are added on create only, and the patch schemas reject unknown keys.

const LeaseTermsFields = LeaseTermsSchema.pick({
  property_name: true,
  unit_address: true,
  city: true,
  landlord_email: true,
  landlord_display_name: true,
  residents: true,
  lease_start_date: true,
  lease_end_date: true,
  notice_days_required: true,
  target_move_out_date: true,
  renewal_offer_expires: true,
  current_monthly_rent: true,
  renewal_monthly_rent: true,
  m2m_premium: true,
  security_deposit: true,
  pet_rent_monthly: true,
  parking_monthly: true,
  included_utilities: true,
  late_fee_rules: true,
  decision: true,
});

// Refines apply on create only; partial patches re-load and re-validate via the row's full state when needed.
export const CreateLeaseTermsInput = LeaseTermsFields.extend({
  notice_days_required: LeaseTermsFields.shape.notice_days_required.default(60),
  m2m_premium: LeaseTermsFields.shape.m2m_premium.default(0),
  pet_rent_monthly: LeaseTermsFields.shape.pet_rent_monthly.default(0),
  parking_monthly: LeaseTermsFields.shape.parking_monthly.default(0),
  included_utilities: LeaseTermsFields.shape.included_utilities.default([]),
  decision: LeaseTermsFields.shape.decision.default("undecided"),
})
  .refine(
    (v) => v.lease_end_date > v.lease_start_date,
    { message: "lease_end_date must be after lease_start_date", path: ["lease_end_date"] },
  )
  .refine(
    (v) => v.target_move_out_date == null || v.target_move_out_date >= v.lease_start_date,
    { message: "target_move_out_date must be on or after lease_start_date", path: ["target_move_out_date"] },
  );

// Residents are replaced whole, so a patch that sends them must say who is
// primary instead of having the row schema's default filled in.
export const UpdateLeaseTermsPatch = LeaseTermsFields.extend({
  residents: z.array(ResidentSchema.extend({ isPrimary: z.boolean() })).min(1),
})
  .partial()
  .strict();

const InsurancePolicyFields = InsurancePolicySchema.pick({
  scope: true,
  property_label: true,
  carrier: true,
  policy_number: true,
  liability_amount: true,
  personal_property_amount: true,
  monthly_cost: true,
  effective_from: true,
  effective_to: true,
  interested_party_listed: true,
  interested_party_name: true,
  document_url: true,
}).extend({
  document_url: WebLinkSchema.nullable(),
});

// Refines apply on create only; partial patches re-load and re-validate via the row's full state when needed.
export const InsurancePolicyCreateInput = InsurancePolicyFields.extend({
  interested_party_listed: InsurancePolicyFields.shape.interested_party_listed.default(false),
}).refine(
  (v) => v.effective_to == null || v.effective_to > v.effective_from,
  { message: "effective_to must be after effective_from (or null for open-ended)", path: ["effective_to"] },
);

export const InsurancePolicyPatchInput = InsurancePolicyFields.partial().strict();

export const DESTINATION_TEXT_LIMITS = {
  name: 200,
  city: 100,
  url: WEB_LINK_MAX,
  amenity: 100,
  amenities: 50,
  notes: 2000,
} as const;

const DestinationFields = DestinationSchema.pick({
  building_name: true,
  street_address: true,
  city: true,
  state_code: true,
  zip_code: true,
  source_url: true,
  fetch_status: true,
  monthly_rent_low: true,
  monthly_rent_high: true,
  application_fee: true,
  security_deposit: true,
  pet_rent_monthly: true,
  parking_monthly: true,
  beds: true,
  baths: true,
  sqft: true,
  amenities: true,
  pets_allowed: true,
  furnished: true,
  insurance_required: true,
  insurance_min_liability: true,
  insurance_min_property: true,
  is_active_target: true,
  notes: true,
}).extend({
  // What a person may send. The address goes to an outside geocoder and the
  // rest is stored, so each has a ceiling. Stored rows are read with the row
  // schema above, which has none.
  building_name: z.string().min(1).max(DESTINATION_TEXT_LIMITS.name),
  street_address: z.string().min(1).max(DESTINATION_TEXT_LIMITS.name),
  city: z.string().min(1).max(DESTINATION_TEXT_LIMITS.city),
  source_url: WebLinkSchema.nullable(),
  amenities: z.array(z.string().max(DESTINATION_TEXT_LIMITS.amenity)).max(DESTINATION_TEXT_LIMITS.amenities),
  notes: z.string().max(DESTINATION_TEXT_LIMITS.notes).nullable(),
});

export const DestinationCreateInput = DestinationFields.extend({
  fetch_status: DestinationFields.shape.fetch_status.default("manual"),
  amenities: DestinationFields.shape.amenities.default([]),
  insurance_required: DestinationFields.shape.insurance_required.default(true),
  is_active_target: DestinationFields.shape.is_active_target.default(false),
});

export const DestinationPatchInput = DestinationFields.partial().strict();

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
