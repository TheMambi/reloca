import type { z } from "zod";
import { LeaseDecisionEnum } from "@/schemas/lease";

type LeaseDecision = z.infer<typeof LeaseDecisionEnum>;

// Sample values for a fictional household. The demo starts the setup form
// with them; a private copy shows them only as greyed examples.
export const FIRST_RUN_DEFAULTS = {
  property_name: "Juniper Court",
  unit_address: "100 Sample Street, Unit 204",
  city: "Denver, CO 80000",
  landlord_email: "",
  landlord_display_name: "Juniper Court Leasing" as string | null,
  residents: [
    { name: "Sam Rivera", email: "" as string | undefined, isPrimary: true },
    { name: "Alex Chen", email: "" as string | undefined, isPrimary: false },
  ],
  lease_start_date: "",
  lease_end_date: "",
  notice_days_required: 60 as number | null,
  target_move_out_date: null as string | null,
  renewal_offer_expires: null as string | null,
  current_monthly_rent: 1800 as number | null,
  renewal_monthly_rent: 1750 as number | null,
  m2m_premium: 400 as number | null,
  security_deposit: null as number | null,
  pet_rent_monthly: 0,
  parking_monthly: 0,
  included_utilities: [] as string[],
  late_fee_rules: "" as string | null,
  decision: "vacate" as LeaseDecision,
};

// What the setup form starts with outside the demo. Nothing here is a guess
// about the household: the notice period and the rents drive real deadlines
// and figures, so they start empty. Pet rent and parking start at 0 because
// "none" is the common answer.
export const FIRST_RUN_BLANK: typeof FIRST_RUN_DEFAULTS = {
  property_name: "",
  unit_address: "",
  city: "",
  landlord_email: "",
  landlord_display_name: null,
  residents: [{ name: "", email: "", isPrimary: true }],
  lease_start_date: "",
  lease_end_date: "",
  notice_days_required: null,
  target_move_out_date: null,
  renewal_offer_expires: null,
  current_monthly_rent: null,
  renewal_monthly_rent: null,
  m2m_premium: null,
  security_deposit: null,
  pet_rent_monthly: 0,
  parking_monthly: 0,
  included_utilities: [],
  late_fee_rules: "",
  decision: "undecided",
};

// The canonical utility chips offered in the multi-select.
export const UTILITY_OPTIONS = [
  "water",
  "trash",
  "gas",
  "electric",
  "internet",
  "heat",
] as const;
