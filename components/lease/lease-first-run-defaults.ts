import type { z } from "zod";
import { LeaseDecisionEnum } from "@/schemas/lease";

type LeaseDecision = z.infer<typeof LeaseDecisionEnum>;

// Single source of truth for the first-run setup form pre-fill.
// Sample values for a fictional household; replace on first run.
// Anything left blank ("") is something the user must supply on first run.
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
  notice_days_required: 60,
  target_move_out_date: null as string | null,
  renewal_offer_expires: null as string | null,
  current_monthly_rent: 1800,
  renewal_monthly_rent: 1750 as number | null,
  m2m_premium: 400,
  security_deposit: null as number | null,
  pet_rent_monthly: 0,
  parking_monthly: 0,
  included_utilities: [] as string[],
  late_fee_rules: "" as string | null,
  decision: "vacate" as LeaseDecision,
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
