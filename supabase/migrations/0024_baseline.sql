-- Reloca migration 0024: baseline
--
-- One file that stands for migrations 0001 to 0024, which were pasted into the
-- SQL editor one at a time with a user id typed into each. It builds the same
-- 13 tables, indexes, triggers and the reorder function, with three
-- differences, all of which migrations 0025 to 0028 would otherwise undo:
--
--   * no grants to anon or authenticated and no single_user_* policies, so
--     there is no user id to type in (0025 removes both from an older database);
--   * reorder_checklist_item is created as 0027 leaves it;
--   * the second index on checklist_items (user_id, category, order_index) is
--     not created (0028 drops it from an older database).
--
-- The sample relocation that 0023 inserted is in supabase/seed.sql.
--
-- A database that already has 0001 to 0024 must not run this file. Record it as
-- applied instead: docs/database.md has the command. On a new database it runs
-- as written, and running it again changes nothing.
--
-- It expects the roles a Supabase database has (service_role). For a plain
-- local PostgreSQL, scripts/db-check.sh creates them first.

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- Fills and clears completed_at alongside the boolean.
CREATE OR REPLACE FUNCTION public.sync_completed_at() RETURNS trigger AS $$
BEGIN
  IF NEW.completed = true AND (OLD.completed = false OR OLD.completed IS NULL) THEN
    NEW.completed_at = now();
  ELSIF NEW.completed = false THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- relocations: one row per move under consideration, one of them active
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.relocations (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid          NOT NULL,
  label             text          NOT NULL,
  origin_slug       text          NOT NULL,   -- a slug from data/cities.json
  destination_slug  text          NOT NULL,   -- a slug from data/cities.json
  move_date         date,
  is_active_move    boolean       NOT NULL DEFAULT false,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_relocations_one_active
  ON public.relocations (user_id) WHERE is_active_move;

-- ---------------------------------------------------------------------------
-- checklist_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.checklist_items (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid          NOT NULL,
  category     text          NOT NULL
                 CONSTRAINT checklist_items_category_check
                 CHECK (category IN ('pre-move','move-week','post-move','lease')),
  title        text          NOT NULL,
  description  text,
  due_date     date,
  completed    boolean       NOT NULL DEFAULT false,
  completed_at timestamptz,
  order_index  integer       NOT NULL DEFAULT 0,
  created_at   timestamptz   NOT NULL DEFAULT now(),
  updated_at   timestamptz   NOT NULL DEFAULT now()
);

-- Also the arbiter for the template insert (ON CONFLICT DO NOTHING), so two
-- requests seeding at once cannot duplicate rows.
CREATE UNIQUE INDEX IF NOT EXISTS idx_checklist_items_seedkey
  ON public.checklist_items (user_id, category, order_index);

-- ---------------------------------------------------------------------------
-- lease_terms and its children
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lease_terms (
  id                       uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid          NOT NULL,
  property_name            text          NOT NULL,
  unit_address             text          NOT NULL,
  city                     text          NOT NULL,
  landlord_email           text          NOT NULL,
  landlord_display_name    text,
  residents                jsonb         NOT NULL,
  lease_start_date         date          NOT NULL,
  lease_end_date           date          NOT NULL,
  notice_days_required     int           NOT NULL DEFAULT 60,
  target_move_out_date     date,
  renewal_offer_expires    date,
  current_monthly_rent     numeric(10,2) NOT NULL,
  renewal_monthly_rent     numeric(10,2),
  m2m_premium              numeric(10,2) NOT NULL DEFAULT 0,
  security_deposit         numeric(10,2),
  pet_rent_monthly         numeric(10,2) NOT NULL DEFAULT 0,
  parking_monthly          numeric(10,2) NOT NULL DEFAULT 0,
  included_utilities       text[]        NOT NULL DEFAULT '{}',
  late_fee_rules           text,
  decision                 text          NOT NULL DEFAULT 'undecided'
                             CONSTRAINT lease_terms_decision_check
                             CHECK (decision IN ('undecided','renew','vacate','m2m')),
  created_at               timestamptz   NOT NULL DEFAULT now(),
  updated_at               timestamptz   NOT NULL DEFAULT now(),
  origin_lat               numeric,
  origin_lng               numeric
);

CREATE INDEX IF NOT EXISTS idx_lease_terms_user ON public.lease_terms (user_id);

-- Deleting a lease deletes its events. No updated_at column, so no trigger.
CREATE TABLE IF NOT EXISTS public.lease_events (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid          NOT NULL,
  lease_id      uuid          NOT NULL REFERENCES public.lease_terms(id) ON DELETE CASCADE,
  kind          text          NOT NULL
                  CONSTRAINT lease_events_kind_check
                  CHECK (kind IN (
                    'notice_send_by',
                    'renewal_offer_expires',
                    'lease_end',
                    'target_move_out',
                    'notice_sent',
                    'walkthrough',
                    'key_return',
                    'deposit_claim_window_end'
                  )),
  occurs_on     date          NOT NULL,
  status        text          NOT NULL DEFAULT 'pending'
                  CONSTRAINT lease_events_status_check
                  CHECK (status IN ('pending','active','done','missed')),
  notes         text,
  created_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lease_events_lease_occurs
  ON public.lease_events (lease_id, occurs_on);

-- Notice letters: drafted, then stamped once when sent.
CREATE TABLE IF NOT EXISTS public.notice_drafts (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid          NOT NULL,
  lease_id        uuid          NOT NULL REFERENCES public.lease_terms(id) ON DELETE CASCADE,
  body_markdown   text          NOT NULL,
  body_plaintext  text          NOT NULL,
  subject_line    text          NOT NULL,
  recipient_email text          NOT NULL,
  move_out_date   date          NOT NULL,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  sent_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_notice_drafts_lease
  ON public.notice_drafts (lease_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- destinations: candidate homes; at most one is the active target
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.destinations (
  id                       uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid          NOT NULL,
  building_name            text          NOT NULL,
  street_address           text          NOT NULL,
  city                     text          NOT NULL,
  source_url               text,
  fetch_status             text          NOT NULL DEFAULT 'manual'
                             CONSTRAINT destinations_fetch_status_check
                             CHECK (fetch_status IN ('manual','needs_review','verified','fetch_failed')),
  fetched_at               timestamptz,
  monthly_rent_low         numeric(10,2),
  monthly_rent_high        numeric(10,2),
  application_fee          numeric(10,2),
  security_deposit         numeric(10,2),
  pet_rent_monthly         numeric(10,2),
  parking_monthly          numeric(10,2),
  beds                     numeric(3,1),
  baths                    numeric(3,1),
  sqft                     int,
  amenities                text[]        NOT NULL DEFAULT '{}',
  pets_allowed             boolean,
  furnished                boolean,
  hud_fmr_2br              numeric(10,2),
  hud_fmr_year             int,
  walk_score               int,
  transit_score            int,
  bike_score               int,
  insurance_required       boolean       NOT NULL DEFAULT true,
  insurance_min_liability  numeric(12,2),
  insurance_min_property   numeric(12,2),
  is_active_target         boolean       NOT NULL DEFAULT false,
  notes                    text,
  created_at               timestamptz   NOT NULL DEFAULT now(),
  updated_at               timestamptz   NOT NULL DEFAULT now(),
  state_code               text
                             CONSTRAINT destinations_state_code_chk
                             CHECK (state_code IS NULL OR state_code ~ '^[A-Z]{2}$'),
  zip_code                 text
                             CONSTRAINT destinations_zip_code_chk
                             CHECK (zip_code IS NULL OR zip_code ~ '^\d{5}(-\d{4})?$'),
  lat                      numeric,
  lng                      numeric,
  -- Removing a relocation keeps the saved home.
  relocation_id            uuid          REFERENCES public.relocations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_destinations_user
  ON public.destinations (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_destinations_one_active
  ON public.destinations (user_id) WHERE is_active_target = true;

-- ---------------------------------------------------------------------------
-- insurance_policies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.insurance_policies (
  id                       uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid          NOT NULL,
  scope                    text          NOT NULL
                             CONSTRAINT insurance_policies_scope_check
                             CHECK (scope IN ('origin','destination')),
  property_label           text          NOT NULL,
  carrier                  text,
  policy_number            text,
  liability_amount         numeric(12,2) NOT NULL,
  personal_property_amount numeric(12,2) NOT NULL,
  monthly_cost             numeric(8,2),
  effective_from           date          NOT NULL,
  effective_to             date,
  interested_party_listed  boolean       NOT NULL DEFAULT false,
  interested_party_name    text,
  document_url             text,
  created_at               timestamptz   NOT NULL DEFAULT now(),
  updated_at               timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_insurance_policies_user_scope
  ON public.insurance_policies (user_id, scope, effective_from);

-- ---------------------------------------------------------------------------
-- utility_transitions and address_change_targets
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.utility_transitions (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid          NOT NULL,
  kind            text          NOT NULL
                    CONSTRAINT utility_transitions_kind_check
                    CHECK (kind IN ('electricity','gas','water','trash','internet','tv','custom')),
  side            text          NOT NULL
                    CONSTRAINT utility_transitions_side_check
                    CHECK (side IN ('origin','destination')),
  custom_label    text,
  provider        text,
  account_number  text,
  login_url       text,
  phone           text,
  notes           text,
  scheduled_date  date,
  status          text          NOT NULL DEFAULT 'needs_action'
                    CONSTRAINT utility_transitions_status_check
                    CHECK (status IN ('needs_action','scheduled','in_progress','confirmed','skipped')),
  confirmed_at    timestamptz,
  order_index     int           NOT NULL DEFAULT 0,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_utility_transitions_status
  ON public.utility_transitions (user_id, status);

CREATE TABLE IF NOT EXISTS public.address_change_targets (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid          NOT NULL,
  kind              text          NOT NULL
                      CONSTRAINT address_change_targets_kind_check
                      CHECK (kind IN ('usps','bank','employer','dmv','voter_reg',
                                      'auto_insurance','health_insurance','subscription','custom')),
  name              text          NOT NULL,
  due_date          date,
  channel           text
                      CONSTRAINT address_change_targets_channel_check
                      CHECK (channel IN ('online','phone','in_person','mail')),
  reference_number  text,
  status            text          NOT NULL DEFAULT 'needs_action'
                      CONSTRAINT address_change_targets_status_check
                      CHECK (status IN ('needs_action','submitted','confirmed','skipped')),
  submitted_at      timestamptz,
  confirmed_at      timestamptz,
  notes             text,
  order_index       int           NOT NULL DEFAULT 0,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_address_change_targets_user_due
  ON public.address_change_targets (user_id, due_date);

-- ---------------------------------------------------------------------------
-- move_estimates: one row per user; scenarios is a JSON array
-- (schemas/move-cost.ts has its shape)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.move_estimates (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid          NOT NULL UNIQUE,
  distance_miles      numeric,
  volume_cuft         numeric,
  move_date           date,
  scenarios           jsonb         NOT NULL DEFAULT '[]'::jsonb,
  chosen_scenario_id  text,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- move-out walkthrough: a header row and one row per room
-- ---------------------------------------------------------------------------
-- The record outlives its lease.
CREATE TABLE IF NOT EXISTS public.move_out_walkthroughs (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid          NOT NULL,
  lease_terms_id    uuid          REFERENCES public.lease_terms(id) ON DELETE SET NULL,
  walkthrough_date  date,
  overall_notes     text,
  pdf_generated_at  timestamptz,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_move_out_walkthroughs_user
  ON public.move_out_walkthroughs (user_id);

CREATE TABLE IF NOT EXISTS public.move_out_room_records (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  walkthrough_id      uuid          NOT NULL REFERENCES public.move_out_walkthroughs(id) ON DELETE CASCADE,
  user_id             uuid          NOT NULL,
  room_name           text          NOT NULL,
  condition_rating    int
                        CONSTRAINT move_out_room_records_condition_rating_check
                        CHECK (condition_rating BETWEEN 1 AND 5),
  cleanliness_rating  int
                        CONSTRAINT move_out_room_records_cleanliness_rating_check
                        CHECK (cleanliness_rating BETWEEN 1 AND 5),
  walls_status        text,
  floors_status       text,
  appliances_status   text,
  fixtures_status     text,
  notes               text,
  order_index         int           NOT NULL DEFAULT 0,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_move_out_room_records_walkthrough
  ON public.move_out_room_records (walkthrough_id, order_index);
CREATE INDEX IF NOT EXISTS idx_move_out_room_records_user
  ON public.move_out_room_records (user_id);

-- ---------------------------------------------------------------------------
-- saved_neighborhoods: a neighborhood can be saved once per user
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saved_neighborhoods (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid          NOT NULL,
  neighborhood  text          NOT NULL,
  city          text          NOT NULL,
  notes         text,
  created_at    timestamptz   NOT NULL DEFAULT now(),
  -- Removing a relocation keeps the saved neighborhood.
  relocation_id uuid          REFERENCES public.relocations(id) ON DELETE SET NULL,
  UNIQUE (user_id, neighborhood, city)
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER checklist_items_set_updated_at
  BEFORE UPDATE ON public.checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER checklist_items_sync_completed_at
  BEFORE UPDATE ON public.checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.sync_completed_at();
CREATE OR REPLACE TRIGGER lease_terms_set_updated_at
  BEFORE UPDATE ON public.lease_terms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER destinations_set_updated_at
  BEFORE UPDATE ON public.destinations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER insurance_policies_set_updated_at
  BEFORE UPDATE ON public.insurance_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER utility_transitions_set_updated_at
  BEFORE UPDATE ON public.utility_transitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER address_change_targets_set_updated_at
  BEFORE UPDATE ON public.address_change_targets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER move_estimates_set_updated_at
  BEFORE UPDATE ON public.move_estimates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER move_out_walkthroughs_set_updated_at
  BEFORE UPDATE ON public.move_out_walkthroughs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER move_out_room_records_set_updated_at
  BEFORE UPDATE ON public.move_out_room_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE OR REPLACE TRIGGER relocations_set_updated_at
  BEFORE UPDATE ON public.relocations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Access: the server's role only. Row level security is on with no policy, so
-- anon and authenticated are refused even if a grant ever appears.
-- ---------------------------------------------------------------------------
ALTER TABLE public.relocations            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lease_terms            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lease_events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notice_drafts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.destinations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurance_policies     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.utility_transitions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.address_change_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.move_estimates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.move_out_walkthroughs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.move_out_room_records  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_neighborhoods    ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.relocations, public.checklist_items, public.lease_terms,
  public.lease_events, public.notice_drafts, public.destinations,
  public.insurance_policies, public.utility_transitions,
  public.address_change_targets, public.move_estimates,
  public.move_out_walkthroughs, public.move_out_room_records,
  public.saved_neighborhoods
  TO service_role;

-- ---------------------------------------------------------------------------
-- reorder_checklist_item: moves one task to a place in a phase and renumbers
-- both phases in one transaction. Positions are places in a dense list
-- (0, 1, 2, ...). The unique index is checked per row, so the other rows pass
-- through a range no stored row uses before taking their final places.
-- Lease tasks are written from the lease and are not moved by hand.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reorder_checklist_item(
  p_id uuid,
  p_target_category text,
  p_target_index int
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
STRICT
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_source_category text;
  v_dest_others int;
  v_target int;
BEGIN
  IF p_target_category NOT IN ('pre-move', 'move-week', 'post-move') THEN
    RAISE EXCEPTION 'Invalid target category: %', p_target_category;
  END IF;

  IF p_target_index < 0 THEN
    RAISE EXCEPTION 'Target index must be non-negative, got %', p_target_index;
  END IF;

  SELECT user_id, category
    INTO v_user_id, v_source_category
  FROM checklist_items
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checklist item % not found', p_id;
  END IF;

  IF v_source_category = 'lease' THEN
    RAISE EXCEPTION 'Lease tasks cannot be reordered';
  END IF;

  -- No early return when the stored index already equals the target: with a
  -- hole in the numbering that is still a real move. A true no-op just writes
  -- the same order back.

  -- Clamp the target so the moved row always lands contiguously (a target past
  -- the end of the destination would otherwise leave a hole in [0, N)).
  SELECT count(*) INTO v_dest_others
  FROM checklist_items
  WHERE user_id = v_user_id AND category = p_target_category AND id <> p_id;
  v_target := least(p_target_index, v_dest_others);

  -- Park the moved row at -1 so the renumber passes can't collide with it.
  UPDATE checklist_items SET order_index = -1 WHERE id = p_id;

  IF v_source_category = p_target_category THEN
    -- Same-category: renumber the others, leaving a gap at v_target.
    -- Pass 1 → disjoint negatives (-2, -3, …); pass 2 → final positives.
    WITH ord AS (
      SELECT id, (row_number() OVER (ORDER BY order_index) - 1) AS rn
      FROM checklist_items
      WHERE user_id = v_user_id AND category = v_source_category AND id <> p_id
    )
    UPDATE checklist_items c
    SET order_index = -2 - ord.rn
    FROM ord WHERE c.id = ord.id;

    WITH ord AS (
      SELECT id, (-order_index - 2) AS rn
      FROM checklist_items
      WHERE user_id = v_user_id AND category = v_source_category AND id <> p_id
    )
    UPDATE checklist_items c
    SET order_index = CASE WHEN ord.rn < v_target THEN ord.rn ELSE ord.rn + 1 END
    FROM ord WHERE c.id = ord.id;
  ELSE
    -- Cross-category: close the gap in the source (dense), then open a gap at
    -- v_target in the destination. Each via the same negative-dump technique.
    WITH ord AS (
      SELECT id, (row_number() OVER (ORDER BY order_index) - 1) AS rn
      FROM checklist_items
      WHERE user_id = v_user_id AND category = v_source_category AND id <> p_id
    )
    UPDATE checklist_items c
    SET order_index = -2 - ord.rn
    FROM ord WHERE c.id = ord.id;

    WITH ord AS (
      SELECT id, (-order_index - 2) AS rn
      FROM checklist_items
      WHERE user_id = v_user_id AND category = v_source_category AND id <> p_id
    )
    UPDATE checklist_items c
    SET order_index = ord.rn
    FROM ord WHERE c.id = ord.id;

    WITH ord AS (
      SELECT id, (row_number() OVER (ORDER BY order_index) - 1) AS rn
      FROM checklist_items
      WHERE user_id = v_user_id AND category = p_target_category AND id <> p_id
    )
    UPDATE checklist_items c
    SET order_index = -2 - ord.rn
    FROM ord WHERE c.id = ord.id;

    WITH ord AS (
      SELECT id, (-order_index - 2) AS rn
      FROM checklist_items
      WHERE user_id = v_user_id AND category = p_target_category AND id <> p_id
    )
    UPDATE checklist_items c
    SET order_index = CASE WHEN ord.rn < v_target THEN ord.rn ELSE ord.rn + 1 END
    FROM ord WHERE c.id = ord.id;
  END IF;

  -- Place the moved row at its final position.
  UPDATE checklist_items
  SET category = p_target_category,
      order_index = v_target,
      updated_at = now()
  WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_checklist_item(uuid, text, int)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_checklist_item(uuid, text, int)
  TO service_role;
