// Generated from the database by scripts/gen-db-types.mjs. Do not edit by hand.
// To change a table, add a migration, then run `pnpm db:check` and follow its
// message. docs/database.md has the details.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      address_change_targets: {
        Row: {
          channel: string | null
          confirmed_at: string | null
          created_at: string
          due_date: string | null
          id: string
          kind: string
          name: string
          notes: string | null
          order_index: number
          reference_number: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          channel?: string | null
          confirmed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          kind: string
          name: string
          notes?: string | null
          order_index?: number
          reference_number?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string | null
          confirmed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          kind?: string
          name?: string
          notes?: string | null
          order_index?: number
          reference_number?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      checklist_items: {
        Row: {
          category: string
          completed: boolean
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          order_index: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          order_index?: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          order_index?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      destinations: {
        Row: {
          amenities: string[]
          application_fee: number | null
          baths: number | null
          beds: number | null
          bike_score: number | null
          building_name: string
          city: string
          created_at: string
          fetch_status: string
          fetched_at: string | null
          furnished: boolean | null
          hud_fmr_2br: number | null
          hud_fmr_year: number | null
          id: string
          insurance_min_liability: number | null
          insurance_min_property: number | null
          insurance_required: boolean
          is_active_target: boolean
          lat: number | null
          lng: number | null
          monthly_rent_high: number | null
          monthly_rent_low: number | null
          notes: string | null
          parking_monthly: number | null
          pet_rent_monthly: number | null
          pets_allowed: boolean | null
          relocation_id: string | null
          security_deposit: number | null
          source_url: string | null
          sqft: number | null
          state_code: string | null
          street_address: string
          transit_score: number | null
          updated_at: string
          user_id: string
          walk_score: number | null
          zip_code: string | null
        }
        Insert: {
          amenities?: string[]
          application_fee?: number | null
          baths?: number | null
          beds?: number | null
          bike_score?: number | null
          building_name: string
          city: string
          created_at?: string
          fetch_status?: string
          fetched_at?: string | null
          furnished?: boolean | null
          hud_fmr_2br?: number | null
          hud_fmr_year?: number | null
          id?: string
          insurance_min_liability?: number | null
          insurance_min_property?: number | null
          insurance_required?: boolean
          is_active_target?: boolean
          lat?: number | null
          lng?: number | null
          monthly_rent_high?: number | null
          monthly_rent_low?: number | null
          notes?: string | null
          parking_monthly?: number | null
          pet_rent_monthly?: number | null
          pets_allowed?: boolean | null
          relocation_id?: string | null
          security_deposit?: number | null
          source_url?: string | null
          sqft?: number | null
          state_code?: string | null
          street_address: string
          transit_score?: number | null
          updated_at?: string
          user_id: string
          walk_score?: number | null
          zip_code?: string | null
        }
        Update: {
          amenities?: string[]
          application_fee?: number | null
          baths?: number | null
          beds?: number | null
          bike_score?: number | null
          building_name?: string
          city?: string
          created_at?: string
          fetch_status?: string
          fetched_at?: string | null
          furnished?: boolean | null
          hud_fmr_2br?: number | null
          hud_fmr_year?: number | null
          id?: string
          insurance_min_liability?: number | null
          insurance_min_property?: number | null
          insurance_required?: boolean
          is_active_target?: boolean
          lat?: number | null
          lng?: number | null
          monthly_rent_high?: number | null
          monthly_rent_low?: number | null
          notes?: string | null
          parking_monthly?: number | null
          pet_rent_monthly?: number | null
          pets_allowed?: boolean | null
          relocation_id?: string | null
          security_deposit?: number | null
          source_url?: string | null
          sqft?: number | null
          state_code?: string | null
          street_address?: string
          transit_score?: number | null
          updated_at?: string
          user_id?: string
          walk_score?: number | null
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "destinations_relocation_id_fkey"
            columns: ["relocation_id"]
            isOneToOne: false
            referencedRelation: "relocations"
            referencedColumns: ["id"]
          },
        ]
      }
      insurance_policies: {
        Row: {
          carrier: string | null
          created_at: string
          document_url: string | null
          effective_from: string
          effective_to: string | null
          id: string
          interested_party_listed: boolean
          interested_party_name: string | null
          liability_amount: number
          monthly_cost: number | null
          personal_property_amount: number
          policy_number: string | null
          property_label: string
          scope: string
          updated_at: string
          user_id: string
        }
        Insert: {
          carrier?: string | null
          created_at?: string
          document_url?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          interested_party_listed?: boolean
          interested_party_name?: string | null
          liability_amount: number
          monthly_cost?: number | null
          personal_property_amount: number
          policy_number?: string | null
          property_label: string
          scope: string
          updated_at?: string
          user_id: string
        }
        Update: {
          carrier?: string | null
          created_at?: string
          document_url?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          interested_party_listed?: boolean
          interested_party_name?: string | null
          liability_amount?: number
          monthly_cost?: number | null
          personal_property_amount?: number
          policy_number?: string | null
          property_label?: string
          scope?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lease_events: {
        Row: {
          created_at: string
          id: string
          kind: string
          lease_id: string
          notes: string | null
          occurs_on: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          lease_id: string
          notes?: string | null
          occurs_on: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          lease_id?: string
          notes?: string | null
          occurs_on?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lease_events_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "lease_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      lease_terms: {
        Row: {
          city: string
          created_at: string
          current_monthly_rent: number
          decision: string
          id: string
          included_utilities: string[]
          landlord_display_name: string | null
          landlord_email: string
          late_fee_rules: string | null
          lease_end_date: string
          lease_start_date: string
          m2m_premium: number
          notice_days_required: number
          origin_lat: number | null
          origin_lng: number | null
          parking_monthly: number
          pet_rent_monthly: number
          property_name: string
          renewal_monthly_rent: number | null
          renewal_offer_expires: string | null
          residents: Json
          security_deposit: number | null
          target_move_out_date: string | null
          unit_address: string
          updated_at: string
          user_id: string
        }
        Insert: {
          city: string
          created_at?: string
          current_monthly_rent: number
          decision?: string
          id?: string
          included_utilities?: string[]
          landlord_display_name?: string | null
          landlord_email: string
          late_fee_rules?: string | null
          lease_end_date: string
          lease_start_date: string
          m2m_premium?: number
          notice_days_required?: number
          origin_lat?: number | null
          origin_lng?: number | null
          parking_monthly?: number
          pet_rent_monthly?: number
          property_name: string
          renewal_monthly_rent?: number | null
          renewal_offer_expires?: string | null
          residents: Json
          security_deposit?: number | null
          target_move_out_date?: string | null
          unit_address: string
          updated_at?: string
          user_id: string
        }
        Update: {
          city?: string
          created_at?: string
          current_monthly_rent?: number
          decision?: string
          id?: string
          included_utilities?: string[]
          landlord_display_name?: string | null
          landlord_email?: string
          late_fee_rules?: string | null
          lease_end_date?: string
          lease_start_date?: string
          m2m_premium?: number
          notice_days_required?: number
          origin_lat?: number | null
          origin_lng?: number | null
          parking_monthly?: number
          pet_rent_monthly?: number
          property_name?: string
          renewal_monthly_rent?: number | null
          renewal_offer_expires?: string | null
          residents?: Json
          security_deposit?: number | null
          target_move_out_date?: string | null
          unit_address?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      move_estimates: {
        Row: {
          chosen_scenario_id: string | null
          created_at: string
          distance_miles: number | null
          id: string
          move_date: string | null
          scenarios: Json
          updated_at: string
          user_id: string
          volume_cuft: number | null
        }
        Insert: {
          chosen_scenario_id?: string | null
          created_at?: string
          distance_miles?: number | null
          id?: string
          move_date?: string | null
          scenarios?: Json
          updated_at?: string
          user_id: string
          volume_cuft?: number | null
        }
        Update: {
          chosen_scenario_id?: string | null
          created_at?: string
          distance_miles?: number | null
          id?: string
          move_date?: string | null
          scenarios?: Json
          updated_at?: string
          user_id?: string
          volume_cuft?: number | null
        }
        Relationships: []
      }
      move_out_room_records: {
        Row: {
          appliances_status: string | null
          cleanliness_rating: number | null
          condition_rating: number | null
          created_at: string
          fixtures_status: string | null
          floors_status: string | null
          id: string
          notes: string | null
          order_index: number
          room_name: string
          updated_at: string
          user_id: string
          walkthrough_id: string
          walls_status: string | null
        }
        Insert: {
          appliances_status?: string | null
          cleanliness_rating?: number | null
          condition_rating?: number | null
          created_at?: string
          fixtures_status?: string | null
          floors_status?: string | null
          id?: string
          notes?: string | null
          order_index?: number
          room_name: string
          updated_at?: string
          user_id: string
          walkthrough_id: string
          walls_status?: string | null
        }
        Update: {
          appliances_status?: string | null
          cleanliness_rating?: number | null
          condition_rating?: number | null
          created_at?: string
          fixtures_status?: string | null
          floors_status?: string | null
          id?: string
          notes?: string | null
          order_index?: number
          room_name?: string
          updated_at?: string
          user_id?: string
          walkthrough_id?: string
          walls_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "move_out_room_records_walkthrough_id_fkey"
            columns: ["walkthrough_id"]
            isOneToOne: false
            referencedRelation: "move_out_walkthroughs"
            referencedColumns: ["id"]
          },
        ]
      }
      move_out_walkthroughs: {
        Row: {
          created_at: string
          id: string
          lease_terms_id: string | null
          overall_notes: string | null
          pdf_generated_at: string | null
          updated_at: string
          user_id: string
          walkthrough_date: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          lease_terms_id?: string | null
          overall_notes?: string | null
          pdf_generated_at?: string | null
          updated_at?: string
          user_id: string
          walkthrough_date?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          lease_terms_id?: string | null
          overall_notes?: string | null
          pdf_generated_at?: string | null
          updated_at?: string
          user_id?: string
          walkthrough_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "move_out_walkthroughs_lease_terms_id_fkey"
            columns: ["lease_terms_id"]
            isOneToOne: false
            referencedRelation: "lease_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      notice_drafts: {
        Row: {
          body_markdown: string
          body_plaintext: string
          created_at: string
          id: string
          lease_id: string
          move_out_date: string
          recipient_email: string
          sent_at: string | null
          subject_line: string
          user_id: string
        }
        Insert: {
          body_markdown: string
          body_plaintext: string
          created_at?: string
          id?: string
          lease_id: string
          move_out_date: string
          recipient_email: string
          sent_at?: string | null
          subject_line: string
          user_id: string
        }
        Update: {
          body_markdown?: string
          body_plaintext?: string
          created_at?: string
          id?: string
          lease_id?: string
          move_out_date?: string
          recipient_email?: string
          sent_at?: string | null
          subject_line?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notice_drafts_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "lease_terms"
            referencedColumns: ["id"]
          },
        ]
      }
      relocations: {
        Row: {
          created_at: string
          destination_slug: string
          id: string
          is_active_move: boolean
          label: string
          move_date: string | null
          origin_slug: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          destination_slug: string
          id?: string
          is_active_move?: boolean
          label: string
          move_date?: string | null
          origin_slug: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          destination_slug?: string
          id?: string
          is_active_move?: boolean
          label?: string
          move_date?: string | null
          origin_slug?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_neighborhoods: {
        Row: {
          city: string
          created_at: string
          id: string
          neighborhood: string
          notes: string | null
          relocation_id: string | null
          user_id: string
        }
        Insert: {
          city: string
          created_at?: string
          id?: string
          neighborhood: string
          notes?: string | null
          relocation_id?: string | null
          user_id: string
        }
        Update: {
          city?: string
          created_at?: string
          id?: string
          neighborhood?: string
          notes?: string | null
          relocation_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_neighborhoods_relocation_id_fkey"
            columns: ["relocation_id"]
            isOneToOne: false
            referencedRelation: "relocations"
            referencedColumns: ["id"]
          },
        ]
      }
      utility_transitions: {
        Row: {
          account_number: string | null
          confirmed_at: string | null
          created_at: string
          custom_label: string | null
          id: string
          kind: string
          login_url: string | null
          notes: string | null
          order_index: number
          phone: string | null
          provider: string | null
          scheduled_date: string | null
          side: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_number?: string | null
          confirmed_at?: string | null
          created_at?: string
          custom_label?: string | null
          id?: string
          kind: string
          login_url?: string | null
          notes?: string | null
          order_index?: number
          phone?: string | null
          provider?: string | null
          scheduled_date?: string | null
          side: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_number?: string | null
          confirmed_at?: string | null
          created_at?: string
          custom_label?: string | null
          id?: string
          kind?: string
          login_url?: string | null
          notes?: string | null
          order_index?: number
          phone?: string | null
          provider?: string | null
          scheduled_date?: string | null
          side?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      reorder_checklist_item: {
        Args: { p_id: string; p_target_category: string; p_target_index: number }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
