// Run: npx tsx schemas/lease.test.ts
import assert from "node:assert/strict";
import {
  CreateLeaseTermsInput,
  DestinationCreateInput,
  DestinationPatchInput,
  InsurancePolicyCreateInput,
  InsurancePolicyPatchInput,
  UpdateLeaseTermsPatch,
} from "./lease";

// ---- patches carry only the keys they were given ----------------------------
// A one-field edit used to come back with every defaulted field filled in, and
// the action wrote those defaults over the saved values.

assert.deepEqual(UpdateLeaseTermsPatch.parse({ decision: "vacate" }), { decision: "vacate" });
assert.deepEqual(
  UpdateLeaseTermsPatch.parse({ target_move_out_date: "2027-10-27" }),
  { target_move_out_date: "2027-10-27" },
);
assert.deepEqual(UpdateLeaseTermsPatch.parse({}), {});

assert.deepEqual(InsurancePolicyPatchInput.parse({ carrier: "Acme Mutual" }), { carrier: "Acme Mutual" });
assert.deepEqual(InsurancePolicyPatchInput.parse({}), {});

assert.deepEqual(DestinationPatchInput.parse({ notes: "Top floor" }), { notes: "Top floor" });
assert.deepEqual(DestinationPatchInput.parse({}), {});

// ---- patches still validate what they are given -----------------------------

assert.equal(UpdateLeaseTermsPatch.safeParse({ decision: "maybe" }).success, false);
assert.equal(UpdateLeaseTermsPatch.safeParse({ m2m_premium: -1 }).success, false);
assert.deepEqual(UpdateLeaseTermsPatch.parse({ target_move_out_date: null }), { target_move_out_date: null });

// A default nested inside a patch field is still a default.
const residents = [{ name: "Sam", isPrimary: true }, { name: "Alex", isPrimary: false }];
assert.deepEqual(UpdateLeaseTermsPatch.parse({ residents }), { residents });
assert.equal(UpdateLeaseTermsPatch.safeParse({ residents: [{ name: "Sam" }] }).success, false);

// ---- patches reject keys that are not editable fields -----------------------

const someId = "11111111-1111-4111-8111-111111111111";
assert.equal(UpdateLeaseTermsPatch.safeParse({ decision: "vacate", user_id: someId }).success, false);
assert.equal(UpdateLeaseTermsPatch.safeParse({ origin_lat: 1 }).success, false);
assert.equal(InsurancePolicyPatchInput.safeParse({ carrier: "Acme Mutual", user_id: someId }).success, false);
assert.equal(DestinationPatchInput.safeParse({ notes: "Top floor", hud_fmr_2br: 1 }).success, false);

// ---- create still fills the defaults ----------------------------------------

const lease = CreateLeaseTermsInput.parse({
  property_name: "Sample Court",
  unit_address: "1 Sample St",
  city: "Sacramento",
  landlord_email: "landlord@example.com",
  landlord_display_name: null,
  residents: [{ name: "Sam" }],
  lease_start_date: "2026-11-01",
  lease_end_date: "2027-10-31",
  target_move_out_date: null,
  renewal_offer_expires: null,
  current_monthly_rent: 2000,
  renewal_monthly_rent: null,
  security_deposit: null,
  late_fee_rules: null,
});
assert.equal(lease.notice_days_required, 60);
assert.equal(lease.m2m_premium, 0);
assert.equal(lease.pet_rent_monthly, 0);
assert.equal(lease.parking_monthly, 0);
assert.deepEqual(lease.included_utilities, []);
assert.equal(lease.decision, "undecided");
assert.deepEqual(lease.residents, [{ name: "Sam", isPrimary: false }]);

// Values the caller does send win over the defaults.
const custom = CreateLeaseTermsInput.parse({ ...lease, notice_days_required: 30, m2m_premium: 250, decision: "renew" });
assert.equal(custom.notice_days_required, 30);
assert.equal(custom.m2m_premium, 250);
assert.equal(custom.decision, "renew");

// The create-only date rules still apply.
assert.equal(CreateLeaseTermsInput.safeParse({ ...lease, lease_end_date: "2026-10-31" }).success, false);
assert.equal(CreateLeaseTermsInput.safeParse({ ...lease, target_move_out_date: "2026-10-01" }).success, false);

const policy = InsurancePolicyCreateInput.parse({
  scope: "origin",
  property_label: "Sample Court",
  carrier: null,
  policy_number: null,
  liability_amount: 100000,
  personal_property_amount: 20000,
  monthly_cost: null,
  effective_from: "2026-11-01",
  effective_to: null,
  interested_party_name: null,
  document_url: null,
});
assert.equal(policy.interested_party_listed, false);
assert.equal(InsurancePolicyCreateInput.safeParse({ ...policy, effective_to: "2026-10-01" }).success, false);

const destination = DestinationCreateInput.parse({
  building_name: "Sample Lofts",
  street_address: "2 Sample Ave",
  city: "Long Beach",
  state_code: "CA",
  zip_code: "90802",
  source_url: null,
  monthly_rent_low: null,
  monthly_rent_high: null,
  application_fee: null,
  security_deposit: null,
  pet_rent_monthly: null,
  parking_monthly: null,
  beds: null,
  baths: null,
  sqft: null,
  pets_allowed: null,
  furnished: null,
  insurance_min_liability: null,
  insurance_min_property: null,
  notes: null,
});
assert.equal(destination.fetch_status, "manual");
assert.deepEqual(destination.amenities, []);
assert.equal(destination.insurance_required, true);
assert.equal(destination.is_active_target, false);

console.log("schemas/lease.test.ts passed");
