/**
 * Database types — mirrors the Postgres tables defined in `supabase/migrations/`.
 *
 * Hand-written until we wire up `supabase gen types typescript`. Keep this
 * file in sync with the migrations. The Zod schemas under `/schemas/` are the
 * single source of truth for *application* shape; this file describes the
 * *database* shape (with Insert/Update variants the Zod schemas lack) so the
 * Supabase client can type-check `.insert()` / `.update()` payloads.
 *
 * Coverage:
 *   - 0001_checklist.sql                   → checklist_items
 *   - 0003_lease_terms.sql                 → lease_terms
 *   - 0004_lease_events.sql                → lease_events
 *   - 0005_notice_drafts.sql               → notice_drafts
 *   - 0006_destinations.sql                → destinations
 *   - 0007_insurance_policies.sql          → insurance_policies
 *   - 0008_lease_checklist_category.sql    → adds 'lease' to ChecklistCategory
 *   - 0011_utility_transitions.sql         → utility_transitions
 *   - 0012_address_change_targets.sql      → address_change_targets
 *   - 0013_move_estimates.sql              → move_estimates
 *   - 0014_move_out_walkthroughs.sql       → move_out_walkthroughs
 *   - 0015_move_out_room_records.sql       → move_out_room_records
 *   - 0016_geocoded_addresses.sql          → lat/lng on destinations + lease_terms
 *   - 0019_saved_neighborhoods.sql         → saved_neighborhoods
 *   - 0020_relocations.sql                 → relocations
 *   - 0021/0022 (relocation_id)            → nullable FK on destinations + saved_neighborhoods
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ChecklistCategory =
  | "pre-move"
  | "move-week"
  | "post-move"
  | "lease";

export type LeaseDecision = "undecided" | "renew" | "vacate" | "m2m";

export type LeaseEventKind =
  | "notice_send_by"
  | "renewal_offer_expires"
  | "lease_end"
  | "target_move_out"
  | "notice_sent"
  | "walkthrough"
  | "key_return"
  | "deposit_claim_window_end";

export type LeaseEventStatus = "pending" | "active" | "done" | "missed";

export type FetchStatus = "manual" | "needs_review" | "verified" | "fetch_failed";

export type InsuranceScope = "origin" | "destination";

export type UtilityKind =
  | "electricity"
  | "gas"
  | "water"
  | "trash"
  | "internet"
  | "tv"
  | "custom";

export type UtilitySide = "origin" | "destination";

export type UtilityStatus =
  | "needs_action"
  | "scheduled"
  | "in_progress"
  | "confirmed"
  | "skipped";

export type AddressTargetKind =
  | "usps"
  | "bank"
  | "employer"
  | "dmv"
  | "voter_reg"
  | "auto_insurance"
  | "health_insurance"
  | "subscription"
  | "custom";

export type AddressTargetChannel = "online" | "phone" | "in_person" | "mail";

export type AddressTargetStatus =
  | "needs_action"
  | "submitted"
  | "confirmed"
  | "skipped";

export interface Database {
  public: {
    Tables: {
      checklist_items: {
        Row: {
          id: string;
          user_id: string;
          category: ChecklistCategory;
          title: string;
          description: string | null;
          due_date: string | null;
          completed: boolean;
          completed_at: string | null;
          order_index: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          category: ChecklistCategory;
          title: string;
          description?: string | null;
          due_date?: string | null;
          completed?: boolean;
          completed_at?: string | null;
          order_index?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          category?: ChecklistCategory;
          title?: string;
          description?: string | null;
          due_date?: string | null;
          completed?: boolean;
          completed_at?: string | null;
          order_index?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      lease_terms: {
        Row: {
          id: string;
          user_id: string;
          property_name: string;
          unit_address: string;
          city: string;
          landlord_email: string;
          landlord_display_name: string | null;
          residents: Json;
          lease_start_date: string;
          lease_end_date: string;
          notice_days_required: number;
          target_move_out_date: string | null;
          renewal_offer_expires: string | null;
          current_monthly_rent: string;
          renewal_monthly_rent: string | null;
          m2m_premium: string;
          security_deposit: string | null;
          pet_rent_monthly: string;
          parking_monthly: string;
          included_utilities: string[];
          late_fee_rules: string | null;
          decision: LeaseDecision;
          origin_lat: string | null;
          origin_lng: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          property_name: string;
          unit_address: string;
          city: string;
          landlord_email: string;
          landlord_display_name?: string | null;
          residents: Json;
          lease_start_date: string;
          lease_end_date: string;
          notice_days_required?: number;
          target_move_out_date?: string | null;
          renewal_offer_expires?: string | null;
          current_monthly_rent: number | string;
          renewal_monthly_rent?: number | string | null;
          m2m_premium?: number | string;
          security_deposit?: number | string | null;
          pet_rent_monthly?: number | string;
          parking_monthly?: number | string;
          included_utilities?: string[];
          late_fee_rules?: string | null;
          decision?: LeaseDecision;
          origin_lat?: number | string | null;
          origin_lng?: number | string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          property_name?: string;
          unit_address?: string;
          city?: string;
          landlord_email?: string;
          landlord_display_name?: string | null;
          residents?: Json;
          lease_start_date?: string;
          lease_end_date?: string;
          notice_days_required?: number;
          target_move_out_date?: string | null;
          renewal_offer_expires?: string | null;
          current_monthly_rent?: number | string;
          renewal_monthly_rent?: number | string | null;
          m2m_premium?: number | string;
          security_deposit?: number | string | null;
          pet_rent_monthly?: number | string;
          parking_monthly?: number | string;
          included_utilities?: string[];
          late_fee_rules?: string | null;
          decision?: LeaseDecision;
          origin_lat?: number | string | null;
          origin_lng?: number | string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      lease_events: {
        Row: {
          id: string;
          user_id: string;
          lease_id: string;
          kind: LeaseEventKind;
          occurs_on: string;
          status: LeaseEventStatus;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          lease_id: string;
          kind: LeaseEventKind;
          occurs_on: string;
          status?: LeaseEventStatus;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          lease_id?: string;
          kind?: LeaseEventKind;
          occurs_on?: string;
          status?: LeaseEventStatus;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      notice_drafts: {
        Row: {
          id: string;
          user_id: string;
          lease_id: string;
          body_markdown: string;
          body_plaintext: string;
          subject_line: string;
          recipient_email: string;
          move_out_date: string;
          created_at: string;
          sent_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          lease_id: string;
          body_markdown: string;
          body_plaintext: string;
          subject_line: string;
          recipient_email: string;
          move_out_date: string;
          created_at?: string;
          sent_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          lease_id?: string;
          body_markdown?: string;
          body_plaintext?: string;
          subject_line?: string;
          recipient_email?: string;
          move_out_date?: string;
          created_at?: string;
          sent_at?: string | null;
        };
        Relationships: [];
      };
      destinations: {
        Row: {
          id: string;
          user_id: string;
          relocation_id: string | null;
          building_name: string;
          street_address: string;
          city: string;
          state_code: string | null;
          zip_code: string | null;
          source_url: string | null;
          fetch_status: FetchStatus;
          fetched_at: string | null;
          monthly_rent_low: string | null;
          monthly_rent_high: string | null;
          application_fee: string | null;
          security_deposit: string | null;
          pet_rent_monthly: string | null;
          parking_monthly: string | null;
          beds: string | null;
          baths: string | null;
          sqft: number | null;
          amenities: string[];
          pets_allowed: boolean | null;
          furnished: boolean | null;
          hud_fmr_2br: string | null;
          hud_fmr_year: number | null;
          walk_score: number | null;
          transit_score: number | null;
          bike_score: number | null;
          lat: string | null;
          lng: string | null;
          insurance_required: boolean;
          insurance_min_liability: string | null;
          insurance_min_property: string | null;
          is_active_target: boolean;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          relocation_id?: string | null;
          building_name: string;
          street_address: string;
          city: string;
          state_code?: string | null;
          zip_code?: string | null;
          source_url?: string | null;
          fetch_status?: FetchStatus;
          fetched_at?: string | null;
          monthly_rent_low?: number | string | null;
          monthly_rent_high?: number | string | null;
          application_fee?: number | string | null;
          security_deposit?: number | string | null;
          pet_rent_monthly?: number | string | null;
          parking_monthly?: number | string | null;
          beds?: number | string | null;
          baths?: number | string | null;
          sqft?: number | null;
          amenities?: string[];
          pets_allowed?: boolean | null;
          furnished?: boolean | null;
          hud_fmr_2br?: number | string | null;
          hud_fmr_year?: number | null;
          walk_score?: number | null;
          transit_score?: number | null;
          bike_score?: number | null;
          lat?: number | string | null;
          lng?: number | string | null;
          insurance_required?: boolean;
          insurance_min_liability?: number | string | null;
          insurance_min_property?: number | string | null;
          is_active_target?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          relocation_id?: string | null;
          building_name?: string;
          street_address?: string;
          city?: string;
          state_code?: string | null;
          zip_code?: string | null;
          source_url?: string | null;
          fetch_status?: FetchStatus;
          fetched_at?: string | null;
          monthly_rent_low?: number | string | null;
          monthly_rent_high?: number | string | null;
          application_fee?: number | string | null;
          security_deposit?: number | string | null;
          pet_rent_monthly?: number | string | null;
          parking_monthly?: number | string | null;
          beds?: number | string | null;
          baths?: number | string | null;
          sqft?: number | null;
          amenities?: string[];
          pets_allowed?: boolean | null;
          furnished?: boolean | null;
          hud_fmr_2br?: number | string | null;
          hud_fmr_year?: number | null;
          walk_score?: number | null;
          transit_score?: number | null;
          bike_score?: number | null;
          lat?: number | string | null;
          lng?: number | string | null;
          insurance_required?: boolean;
          insurance_min_liability?: number | string | null;
          insurance_min_property?: number | string | null;
          is_active_target?: boolean;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      insurance_policies: {
        Row: {
          id: string;
          user_id: string;
          scope: InsuranceScope;
          property_label: string;
          carrier: string | null;
          policy_number: string | null;
          liability_amount: string;
          personal_property_amount: string;
          monthly_cost: string | null;
          effective_from: string;
          effective_to: string | null;
          interested_party_listed: boolean;
          interested_party_name: string | null;
          document_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          scope: InsuranceScope;
          property_label: string;
          carrier?: string | null;
          policy_number?: string | null;
          liability_amount: number | string;
          personal_property_amount: number | string;
          monthly_cost?: number | string | null;
          effective_from: string;
          effective_to?: string | null;
          interested_party_listed?: boolean;
          interested_party_name?: string | null;
          document_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          scope?: InsuranceScope;
          property_label?: string;
          carrier?: string | null;
          policy_number?: string | null;
          liability_amount?: number | string;
          personal_property_amount?: number | string;
          monthly_cost?: number | string | null;
          effective_from?: string;
          effective_to?: string | null;
          interested_party_listed?: boolean;
          interested_party_name?: string | null;
          document_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      utility_transitions: {
        Row: {
          id: string;
          user_id: string;
          kind: UtilityKind;
          side: UtilitySide;
          custom_label: string | null;
          provider: string | null;
          account_number: string | null;
          login_url: string | null;
          phone: string | null;
          notes: string | null;
          scheduled_date: string | null;
          status: UtilityStatus;
          confirmed_at: string | null;
          order_index: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          kind: UtilityKind;
          side: UtilitySide;
          custom_label?: string | null;
          provider?: string | null;
          account_number?: string | null;
          login_url?: string | null;
          phone?: string | null;
          notes?: string | null;
          scheduled_date?: string | null;
          status?: UtilityStatus;
          confirmed_at?: string | null;
          order_index?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          kind?: UtilityKind;
          side?: UtilitySide;
          custom_label?: string | null;
          provider?: string | null;
          account_number?: string | null;
          login_url?: string | null;
          phone?: string | null;
          notes?: string | null;
          scheduled_date?: string | null;
          status?: UtilityStatus;
          confirmed_at?: string | null;
          order_index?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      address_change_targets: {
        Row: {
          id: string;
          user_id: string;
          kind: AddressTargetKind;
          name: string;
          due_date: string | null;
          channel: AddressTargetChannel | null;
          reference_number: string | null;
          status: AddressTargetStatus;
          submitted_at: string | null;
          confirmed_at: string | null;
          notes: string | null;
          order_index: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          kind: AddressTargetKind;
          name: string;
          due_date?: string | null;
          channel?: AddressTargetChannel | null;
          reference_number?: string | null;
          status?: AddressTargetStatus;
          submitted_at?: string | null;
          confirmed_at?: string | null;
          notes?: string | null;
          order_index?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          kind?: AddressTargetKind;
          name?: string;
          due_date?: string | null;
          channel?: AddressTargetChannel | null;
          reference_number?: string | null;
          status?: AddressTargetStatus;
          submitted_at?: string | null;
          confirmed_at?: string | null;
          notes?: string | null;
          order_index?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      move_estimates: {
        Row: {
          id: string;
          user_id: string;
          distance_miles: string | null;
          volume_cuft: string | null;
          move_date: string | null;
          scenarios: Json;
          chosen_scenario_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          distance_miles?: number | string | null;
          volume_cuft?: number | string | null;
          move_date?: string | null;
          scenarios?: Json;
          chosen_scenario_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          distance_miles?: number | string | null;
          volume_cuft?: number | string | null;
          move_date?: string | null;
          scenarios?: Json;
          chosen_scenario_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      move_out_walkthroughs: {
        Row: {
          id: string;
          user_id: string;
          lease_terms_id: string | null;
          walkthrough_date: string | null;
          overall_notes: string | null;
          pdf_generated_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          lease_terms_id?: string | null;
          walkthrough_date?: string | null;
          overall_notes?: string | null;
          pdf_generated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          lease_terms_id?: string | null;
          walkthrough_date?: string | null;
          overall_notes?: string | null;
          pdf_generated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      move_out_room_records: {
        Row: {
          id: string;
          walkthrough_id: string;
          user_id: string;
          room_name: string;
          condition_rating: number | null;
          cleanliness_rating: number | null;
          walls_status: string | null;
          floors_status: string | null;
          appliances_status: string | null;
          fixtures_status: string | null;
          notes: string | null;
          order_index: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          walkthrough_id: string;
          user_id: string;
          room_name: string;
          condition_rating?: number | null;
          cleanliness_rating?: number | null;
          walls_status?: string | null;
          floors_status?: string | null;
          appliances_status?: string | null;
          fixtures_status?: string | null;
          notes?: string | null;
          order_index?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          walkthrough_id?: string;
          user_id?: string;
          room_name?: string;
          condition_rating?: number | null;
          cleanliness_rating?: number | null;
          walls_status?: string | null;
          floors_status?: string | null;
          appliances_status?: string | null;
          fixtures_status?: string | null;
          notes?: string | null;
          order_index?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      saved_neighborhoods: {
        Row: {
          id: string;
          user_id: string;
          relocation_id: string | null;
          neighborhood: string;
          city: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          relocation_id?: string | null;
          neighborhood: string;
          city: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          relocation_id?: string | null;
          neighborhood?: string;
          city?: string;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      relocations: {
        Row: {
          id: string;
          user_id: string;
          label: string;
          origin_slug: string;
          destination_slug: string;
          move_date: string | null;
          is_active_move: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          label: string;
          origin_slug: string;
          destination_slug: string;
          move_date?: string | null;
          is_active_move?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          label?: string;
          origin_slug?: string;
          destination_slug?: string;
          move_date?: string | null;
          is_active_move?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      reorder_checklist_item: {
        Args: {
          p_id: string;
          p_target_category: ChecklistCategory;
          p_target_index: number;
        };
        Returns: void;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
