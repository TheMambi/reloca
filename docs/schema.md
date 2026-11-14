# Reloca — Schema Design (Blueprint v1)

Single source of truth for every data shape in the app.

**Authoring rule:** Zod schema is authored first. TypeScript types are *inferred* (`z.infer<typeof X>`) — never hand-written and never duplicated. Every JSON file in `/data` and every Supabase row passes through a Zod parse before reaching any UI code.

This document is the contract between the data layer and the UI. Changes here require explicit approval before implementation.

**Zod version:** v4 (installed at Phase 0.5). Important syntax shifts from v3, used throughout the codebase:
- UUIDs: `z.uuid()` (was `z.string().uuid()`)
- ISO dates: `z.iso.date()` (was `z.string().date()`)
- ISO datetimes: `z.iso.datetime()` (was `z.string().datetime()`)
- URLs: `z.url()` (was `z.string().url()`)

The example code blocks in this doc use the v4 syntax. The authoritative source is always `/schemas/*.ts`.

---

## Static Data (Local JSON, Zod-validated)

### `Property` — `/data/properties.json`

Each item:

```ts
const PropertySchema = z.object({
  id: z.string(),                                    // stable slug, e.g. "lb-belmont-shore-3br"
  city: z.enum(["Denver", "Long Beach"]),
  neighborhood: z.string(),                          // e.g. "Belmont Shore"
  address: z.string(),                               // mock, street-level
  listingType: z.enum(["rent", "buy"]),
  beds: z.number().int().min(0),
  baths: z.number().min(0),                          // half-baths allowed (1.5)
  sqft: z.number().int().positive(),
  price: z.number().int().positive(),                // monthly rent OR sale price
  coordinates: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
  seaProximityKm: z.number().nonnegative(),          // 0 for non-coastal cities → display as "—"
  imageUrl: z.string().url().or(z.string().startsWith("/")),  // placeholder allowed
  // Cross-references — pointers, not duplicated data
  climateProfileRef: z.enum(["denver", "long-beach"]),
  crimeRecordRef: z.enum(["denver", "long-beach"]),
});

const PropertiesFile = z.array(PropertySchema);
type Property = z.infer<typeof PropertySchema>;
```

**Why pointers (`*Ref`) instead of inlined climate/crime:** climate and crime data is per-city, not per-listing. Inlining would duplicate identical data across every Denver listing. Loaders join on read.

---

### `CrimeRecord` — `/data/crime/<slug>.json` (denver · long-beach · sacramento)

The rich one. One file per city.

```ts
const CrimeCategorySchema = z.object({
  category: z.enum(["violent", "property", "qualityOfLife"]),
  subcategory: z.string(),                           // e.g. "burglary", "assault", "vandalism"
  count12mo: z.number().int().nonnegative(),
  per1k: z.number().nonnegative(),                   // per 1,000 residents, 12-month
  trend12mo: z.array(z.number().int().nonnegative()).length(12),  // monthly counts, oldest→newest
});

const HourBucketSchema = z.object({
  hour: z.number().int().min(0).max(23),
  count: z.number().int().nonnegative(),
});

const CrimeRecordSchema = z.object({
  city: z.enum(["Denver", "Long Beach"]),
  population: z.number().int().positive(),           // for per-1k math sanity-checks
  reportingPeriod: z.object({
    start: z.string().date(),                        // ISO date
    end: z.string().date(),
  }),
  summary: z.object({                                // headline numbers
    violentPer1k: z.number().nonnegative(),
    propertyPer1k: z.number().nonnegative(),
    qualityOfLifePer1k: z.number().nonnegative(),
    totalPer1k: z.number().nonnegative(),
  }),
  byCategory: z.array(CrimeCategorySchema),          // ~10–15 subcategories total
  byHourOfDay: z.array(HourBucketSchema).length(24), // for the heatmap
  byMonth: z.array(z.object({                        // overall trend, separate from per-category trend
    month: z.string().regex(/^\d{4}-\d{2}$/),        // "2025-04"
    total: z.number().int().nonnegative(),
  })).length(12),
  benchmarkNational: z.object({                      // overlay reference line in charts
    violentPer1k: z.number().nonnegative(),
    propertyPer1k: z.number().nonnegative(),
  }),
});
type CrimeRecord = z.infer<typeof CrimeRecordSchema>;
```

**Open question (OD-3, defer to Phase 2.3):** is `byHourOfDay` enough for the heatmap, or do we need `byHourOfDay × byCategory` (24 × 3 grid)? Defaulting to flat 24 buckets — escalate if the visualization needs more.

---

### `ClimateProfile` — `/data/climate/<slug>.json` (denver · long-beach · sacramento)

```ts
const ClimateProfileSchema = z.object({
  city: z.enum(["Denver", "Long Beach"]),
  flood: z.object({
    femaTier: z.enum(["X", "B", "A", "AE", "VE"]),   // FEMA flood zone designation
    annualChanceFlood: z.number().min(0).max(1),     // probability, e.g. 0.002 for 1-in-500
  }),
  wildfire: z.object({
    score: z.number().int().min(0).max(100),         // higher = riskier
    nearestActiveZoneKm: z.number().nonnegative().nullable(),
  }),
  seaLevelRise: z.object({
    exposure: z.enum(["none", "low", "moderate", "high"]),
    projection2050cm: z.number().nullable(),         // null for inland
  }),
  earthquake: z.object({                              // added 2026-05-02 (Q1 approved)
    riskLevel: z.enum(["none", "low", "moderate", "significant", "high"]),
    lastMajorEvent: z.string().optional(),            // e.g. "1933 — M6.4 Long Beach earthquake"
  }),
  heatDaysPerYear: z.number().int().nonnegative(),   // days >90°F
  droughtIndex: z.number().min(-5).max(5),           // PDSI-like, negative = drought
  annualPrecipitationIn: z.number().nonnegative(),
  avgHighF: z.number(),
  avgLowF: z.number(),
});
type ClimateProfile = z.infer<typeof ClimateProfileSchema>;
```

---

### `CostOfLiving` — `/data/cost-of-living.json`

Single file with both cities for easy compare.

```ts
const CostCategorySchema = z.object({
  category: z.enum([
    "housing", "utilities", "groceries", "transport",
    "healthcare", "taxes", "childcare", "entertainment",
  ]),
  denverMonthlyMedian: z.number().nonnegative(),
  longBeachMonthlyMedian: z.number().nonnegative(),
  notes: z.string().optional(),                     // surfaced in tooltips for context
});

const CommuteScenarioSchema = z.object({
  city: z.enum(["Denver", "Long Beach"]),
  mode: z.enum(["car", "bike", "walk", "transit"]),
  avgMinutesOneWay: z.number().int().nonnegative(),
  monthlyCost: z.number().nonnegative(),            // gas+parking, transit pass, etc.
});

const CostOfLivingSchema = z.object({
  asOf: z.string().date(),                          // data-as-of date for honesty
  categories: z.array(CostCategorySchema),
  commute: z.array(CommuteScenarioSchema),
});
type CostOfLiving = z.infer<typeof CostOfLivingSchema>;
```

---

### `CommunityInsight` — `/data/community.json`

```ts
const RentBracketSchema = z.object({
  unit: z.enum(["studio", "1br", "2br", "3br"]),
  median: z.number().int().positive(),
});

const TestimonialSchema = z.object({
  author: z.string(),
  role: z.string(),                                 // "Local resident, 8 years"
  neighborhood: z.string(),
  quote: z.string().min(20).max(500),
});

const CityCommunitySchema = z.object({
  city: z.enum(["Denver", "Long Beach"]),
  avgRent: z.array(RentBracketSchema).length(4),
  weatherSummary: z.string(),                       // "320 sunny days, dry winters"
  vibeTags: z.array(z.string()).min(2).max(6),      // editorial — 3–4 short tags
  testimonials: z.array(TestimonialSchema).min(2).max(4),
});

const CommunityInsightFile = z.array(CityCommunitySchema).length(2);
type CityCommunity = z.infer<typeof CityCommunitySchema>;
```

---

### `ChecklistSeed` — `/data/checklist-seed.json`

The template inserted into Supabase on first run.

```ts
const ChecklistSeedItemSchema = z.object({
  category: z.enum(["pre-move-90d", "pre-move-30d", "move-week", "post-move"]),
  title: z.string().min(3),
  description: z.string().nullable(),
  daysOffsetFromMoveDate: z.number().int(),         // -90, -30, 0, 7 — used to compute due_date
  orderIndex: z.number().int().nonnegative(),
});

const ChecklistSeed = z.array(ChecklistSeedItemSchema);
```

**Why `daysOffsetFromMoveDate` instead of absolute due dates:** the template stays valid no matter when the move date changes. The seeder computes `due_date = move date + offset` at insert time, and a later move-date change shifts every row still on its seeded date (`lib/data/move-seeds.ts`). Titles use `{origin}` and `{destination}` placeholders, filled from the active relocation.

---

## Mutable Data (Supabase)

### `checklist_items` table

The only mutable surface in v1.

```sql
CREATE TABLE checklist_items (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid          NOT NULL,
  category     text          NOT NULL CHECK (category IN ('pre-move-90d','pre-move-30d','move-week','post-move')),
  title        text          NOT NULL,
  description  text,
  due_date     date,
  completed    boolean       NOT NULL DEFAULT false,
  completed_at timestamptz,
  order_index  integer       NOT NULL DEFAULT 0,
  created_at   timestamptz   NOT NULL DEFAULT now(),
  updated_at   timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_checklist_user_category
  ON checklist_items (user_id, category, order_index);

-- Auto-update updated_at on row edit
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER checklist_items_set_updated_at
  BEFORE UPDATE ON checklist_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Keep completed_at in sync with completed flag
CREATE OR REPLACE FUNCTION sync_completed_at() RETURNS trigger AS $$
BEGIN
  IF NEW.completed = true AND (OLD.completed = false OR OLD.completed IS NULL) THEN
    NEW.completed_at = now();
  ELSIF NEW.completed = false THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER checklist_items_sync_completed_at
  BEFORE UPDATE ON checklist_items
  FOR EACH ROW EXECUTE FUNCTION sync_completed_at();
```

### Row-Level Security

> **Replaced by migration 0025.** The grants and policies below are how the
> tables were first set up. The policies compared `user_id` with a fixed UUID
> and never looked at who was calling, so anyone holding the anon key could
> read and write every row. Migration 0025 revokes every grant to `anon` and
> `authenticated` and drops these policies on all tables. Row level security
> stays on, only the server reaches the data (with the service role key), and
> the code filters every query by `user_id`. The UUID is an identifier, not a
> secret. See `docs/security-lockdown.md`.

```sql
ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;

-- API role grants (project has "Automatically expose new tables" disabled)
GRANT SELECT, INSERT, UPDATE, DELETE ON checklist_items TO anon, authenticated;

-- v1: single-user, no auth. Literal UUID baked into policies.
-- The committed migration file uses '<RELOCA_SINGLE_USER_ID>' as a placeholder so the
-- real UUID never enters git. Substitute the real value from `.env.local` before
-- applying via the Supabase SQL Editor (or the Supabase MCP for this project's org).

CREATE POLICY "single_user_select"
  ON checklist_items FOR SELECT
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);

CREATE POLICY "single_user_insert"
  ON checklist_items FOR INSERT
  WITH CHECK (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);

CREATE POLICY "single_user_update"
  ON checklist_items FOR UPDATE
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid)
  WITH CHECK (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);

CREATE POLICY "single_user_delete"
  ON checklist_items FOR DELETE
  USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
```

**RLS approach (decided AD at Phase 0.4):** literal UUID in policies. Re-running a single migration is fine for a single-user app; rotating per-connection `current_setting` was rejected as overkill. Trade-off: rotating the UUID requires editing the migration and re-applying — acceptable in v1 because rotation should never happen unless the project moves to multi-user (which itself triggers a full RLS rewrite, ADR-eligible).

**v2 hook:** adding auth takes more than swapping the literal for `auth.uid()`. The policies must also be written `TO authenticated`, the `anon` grants must stay revoked, sign-up must be closed, and `reorder_checklist_item` needs its own owner check.

### Zod schema mirroring the table

```ts
const ChecklistItemSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  category: z.enum(["pre-move-90d", "pre-move-30d", "move-week", "post-move"]),
  title: z.string().min(1),
  description: z.string().nullable(),
  due_date: z.string().date().nullable(),
  completed: z.boolean(),
  completed_at: z.string().datetime().nullable(),
  order_index: z.number().int().nonnegative(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});
type ChecklistItem = z.infer<typeof ChecklistItemSchema>;
```

Database types live in the **hand-written** `lib/supabase/types.ts` (the Supabase type-gen was unavailable at Phase 0; the file mirrors the migrations 1:1 — its header lists coverage). The Zod schema above is the authoritative shape for the *application* (it adds the brand contracts the generated types lack — like the `category` enum). Use Zod to parse Supabase responses before they hit UI code.

---

## Validation Strategy

| Surface | Validation | Failure mode |
|---------|-----------|--------------|
| `data/*.json` at build/dev time | Zod parse in loader | Loader throws → page errors with the Zod issue path. Caught by Next error boundary in dev. |
| Supabase reads | Zod parse in `lib/supabase/server.ts` query helpers | Treat as bug, surface to user as "data integrity error" |
| Supabase writes (server actions) | Zod parse on inputs **before** DB call | Return validation error to form; never trust client |
| URL search params (filters) | Zod parse in route components | Coerce or fall back to defaults silently |

The pattern is uniform: **never let unparsed data reach a component.**

---

## Migration / Schema Evolution Rules

1. Every change to a Zod schema requires a corresponding `data/*.json` update in the same commit.
2. Every change to any table requires a migration file in `supabase/migrations/` and a matching update to the hand-written `lib/supabase/types.ts`.
3. Breaking schema changes block a phase gate — surface to user, do not auto-migrate.

---

## Summary of files this schema produces

| Path | Purpose | Phase introduced |
|------|---------|------------------|
| `/schemas/property.ts` | Property Zod | 0.5 |
| `/schemas/crime.ts` | CrimeRecord Zod | 0.5 |
| `/schemas/climate.ts` | ClimateProfile Zod | 0.5 |
| `/schemas/cost.ts` | CostOfLiving Zod | 0.5 |
| `/schemas/community.ts` | CommunityInsight Zod | 0.5 |
| `/schemas/checklist.ts` | ChecklistItem + ChecklistSeed Zod | 0.5 |
| `/schemas/lease.ts` | Lease module (5 schemas + Resident JSONB) | 6.1 |
| `/data/*.json` (6 files) | Authored static data | 1.1–1.6 |
| Supabase migration `0001_checklist.sql` | Table + RLS | 0.4 |
| Supabase migration `0002_grant_service_role.sql` | service_role GRANT fix | 2.5b |
| Supabase migrations `0003_lease_terms.sql` … `0008_lease_checklist_category.sql` | Lease module tables + lease category extension | 6.2 |
| `/lib/supabase/types.ts` | Hand-written DB types (mirrors migrations) | 0.4 |

---

## v2 Schema — Lease module (Phase 6, kickoff 2026-05-03)


**Linked ADRs:** AD-011 (epic kickoff), AD-012 (free ingestion), AD-013 (scope split).

Five new tables + one CHECK-constraint extension on `checklist_items`. All single-user (RLS literal-UUID pattern, identical to v1 `checklist_items`). All Zod-mirrored in `/schemas/lease.ts`.

### `lease_terms` — one active row per lease

Identity (property_name, unit_address, city, landlord_email, landlord_display_name, residents JSONB), dates (lease_start_date, lease_end_date, notice_days_required default 60, target_move_out_date, renewal_offer_expires), money (current_monthly_rent, renewal_monthly_rent, m2m_premium default 0, security_deposit, pet_rent_monthly, parking_monthly, included_utilities text[], late_fee_rules text), decision (CHECK in 'undecided'/'renew'/'vacate'/'m2m'), bookkeeping (created_at, updated_at via `set_updated_at()` trigger reused from migration 0001).

### `lease_events` — audit trail + derived deadlines

`kind` CHECK in (`notice_send_by`, `renewal_offer_expires`, `lease_end`, `target_move_out`, `notice_sent`, `walkthrough`, `key_return`, `deposit_claim_window_end`). `status` CHECK in (`pending`, `active`, `done`, `missed`). FK to `lease_terms.id` with `ON DELETE CASCADE`.

**Derived events** (`notice_send_by`, `lease_end`, `renewal_offer_expires`, `target_move_out`, `deposit_claim_window_end`) are inserted by `recomputeLeaseEvents(leaseId)` after every `lease_terms` update. Idempotent: inserts the recomputed rows, then deletes the ones they replace, so a failed insert leaves the old deadlines in place. `deposit_claim_window_end` is written only for a state listed in `lib/lease/deposit-rules.ts`. Only `pending` and `done` are ever written; the timeline derives overdue from the date. User-action events (`notice_sent`, `walkthrough`, `key_return`) are insert-only and never recomputed.

### `notice_drafts` — generated text + sent-state

Fields: body_markdown, body_plaintext, subject_line, recipient_email, move_out_date (snapshotted at draft-time so editing `lease_terms` later doesn't corrupt the legal record), created_at, sent_at (null until "Mark sent"). FK to `lease_terms.id` with `ON DELETE CASCADE`.

**Lock-after-send rule** (server-action enforced, not DB): once `sent_at IS NOT NULL`, draft is read-only. Re-edits create a new row. UI shows latest unsent draft, or most-recent-sent if all sent.

### `destinations` — saved compare candidates

Identity (building_name, street_address, city, source_url), ingestion (fetch_status CHECK in `manual`/`needs_review`/`verified`/`fetch_failed`, fetched_at), money (rent_low/high, application_fee, security_deposit, pet_rent, parking), physical (beds, baths, sqft), amenities (text[] + booleans pets_allowed/furnished), overlays (hud_fmr_2br, hud_fmr_year, walk_score, transit_score, bike_score), insurance carry-over (insurance_required default true, insurance_min_liability, insurance_min_property), bookkeeping (is_active_target boolean default false, notes, created_at, updated_at).

**Partial unique index:** `CREATE UNIQUE INDEX idx_destinations_one_active ON destinations (user_id) WHERE is_active_target = true;` — enforces "exactly one active destination per user" at the DB layer.

### `insurance_policies` — two-row timeline (Q7b)

Fields: scope CHECK in (`origin`, `destination`), property_label, carrier, policy_number, liability_amount, personal_property_amount, monthly_cost, effective_from, effective_to (null = open-ended), interested_party_listed boolean default false, interested_party_name text, document_url text (manual link, no Supabase Storage in v1 of this module).

**Gap-warning logic** (computed in RSC, not DB): sort policies by `effective_from`; for each adjacent pair, if `next.effective_from > prev.effective_to + 1 day` → render `--danger` chip "Coverage gap: N days". If latest policy's `effective_to` is null AND `scope = origin`, no warning.

### `checklist_items.category` CHECK extension (Q6b)

Migration `0008_lease_checklist_category.sql`:
```sql
ALTER TABLE checklist_items DROP CONSTRAINT checklist_items_category_check;
ALTER TABLE checklist_items ADD CONSTRAINT checklist_items_category_check
  CHECK (category IN ('pre-move-90d','pre-move-30d','move-week','post-move','lease'));
```

Zod delta in `schemas/checklist.ts`: add `'lease'` to the category enum. TS types re-infer.

`seedLeaseChecklistTasks(leaseId)` runs once on `lease_terms` insert (idempotent — checks for `category='lease'` first), inserts 7 lease-tied tasks (notice send, origin insurance, destination insurance, cancel origin policy, document condition, return keys, track deposit return).

### RLS pattern (all 5 new tables)

Identical to `checklist_items`. For each table:
```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON <table> TO anon, authenticated, service_role;

CREATE POLICY "single_user_select" ON <table>
  FOR SELECT USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
CREATE POLICY "single_user_insert" ON <table>
  FOR INSERT WITH CHECK (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
CREATE POLICY "single_user_update" ON <table>
  FOR UPDATE USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid)
  WITH CHECK (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
CREATE POLICY "single_user_delete" ON <table>
  FOR DELETE USING (user_id = '<RELOCA_SINGLE_USER_ID>'::uuid);
```

**Service-role GRANT is mandatory** per the Phase 2.5b lesson (AD-010-adjacent): the admin client uses service-role JWT, which is its own Postgres role with its own GRANT chain. Without it: every server-side admin call hits Postgres `42501 — permission denied`. Migrations 0003–0007 each include the service_role GRANT line; this is non-negotiable boilerplate.

### Zod conventions reaffirmed for v2 module

- UUIDs: `z.uuid()`
- Dates: `z.iso.date()` (Postgres `date` type)
- Timestamps: `z.iso.datetime({ offset: true })` (Postgres `timestamptz` type — PostgREST returns `+00:00` form, not `Z`, the v1 default Zod 4 `z.iso.datetime()` would reject this)
- Numerics: `z.number().nonnegative()` — Postgres `numeric` returns strings via PostgREST, loader runs `Number(value)` before parsing
- Enums: `z.enum([...])` for CHECK-constrained columns; TS types are `z.infer<typeof X>`

---

## Phase 8 — Relocations & Multi-City (kickoff 2026-05-30)


**Linked ADRs:** AD-028 (epic + Light model), AD-029 (city registry), AD-031 (provenance), AD-030 (Wave B live ingestion).

### `City` — `/data/cities.json` (`schemas/city.ts`) — NEW (Wave A.1)

The single source of truth for the city pool. Static JSON, not Supabase (free-tier; reference data, not user data).

```ts
const CityMetroSchema = z.object({
  hudEntityId: z.string(),       // HUD FMR metro entity, e.g. "METRO31080MM4480"
  censusPlaceFips: z.string(),   // Census place FIPS, e.g. "0643000"
  noaaStationId: z.string(),     // NOAA CDO GHCND station
  aqiReportingArea: z.string(),  // EPA AirNow reporting area
});
const CitySchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  displayName: z.string().min(1),
  stateCode: z.string().length(2),
  routeCode: z.string().length(3),   // "DEN" | "LGB" | "SAC"
  lat: z.number(), lng: z.number(),
  population: z.number().int().positive(),
  metro: CityMetroSchema,
});
```

Seeded: `denver`, `long-beach`, `sacramento`. **Metro keys are best-effort** and verified against live APIs in Wave B (AD-017 lesson); Long Beach HUD entity is the confirmed `METRO31080MM4480`. Loaders: `getCities()`, `getCity(slug)`, `cityName(slug)`, `cityCode(slug)`.

### `DataSource` — `/data/data-sources.json` (`schemas/data-source.ts`) — NEW (Wave A.3)

Provenance registry. Every reference record points at one by `id`.

```ts
const DataSourceSchema = z.object({
  id: z.string(),                              // "cost-modeled-2025"
  label: z.string(), provider: z.string(),
  url: z.url(),
  tier: z.enum(["live", "modeled", "community"]),
  fetchedAt: z.iso.date(),
  notes: z.string().optional(),
});
```

All current Denver+LB data is hand-authored → tagged `modeled`. Wave B ingestion flips relevant tiers to `live`. Loader: `getDataSource(id)`.

### Genericized reference schemas (Wave A.2 — breaking change)

The two-city enums became slug-keyed per-city shapes. Behaviour for Denver + Long Beach was held byte-identical through the refactor — proven at the time by a regression test against a frozen baseline, retired once real ingested numbers replaced the mock values. The genericized-shape + provenance checks live on in `lib/data/reference-schemas.test.ts`.

- **`cost.ts`** — `CostCategory.values: Array<{ city: slug, monthlyMedian }>` replaces `denverMonthlyMedian`/`longBeachMonthlyMedian`. `CommuteScenario.city` is a slug. New loader helper `costValueFor(category, slug)`. `CostCategory` gains optional `source`.
- **`community.ts`** — `CityCommunity.city` is a slug; `.length(2)` dropped (arbitrary city count). Gains optional `source`.
- **`crime.ts` / `climate.ts`** — `city` is a slug. Each gains optional `source`.
- **`property.ts`** — `city`, `climateProfileRef`, `crimeRecordRef` are slug strings (no longer enums). Gains optional `source`.

Every reference JSON record carries a populated `source` id resolving in `data/data-sources.json` (integrity-checked by `lib/data/reference-schemas.test.ts`).

**Consumer note:** `NeighborhoodSummary.city` (`lib/data/neighborhoods.ts`) stays a **display name** — the aggregator resolves the property slug via `cityName()` — so `saved_neighborhoods.city` (display names) and all grid/map/compare consumers are untouched. `neighborhood-compare` resolves the property slug to its display name to join saved rows.

### `AirQualityProfile` — `/data/air-quality/<slug>.json` (`schemas/air-quality.ts`) — NEW (Wave B, AD-030)

EPA AirNow current-observation snapshot per city. A point-in-time reading (stamped `observedAt`), not a rolling average — the Wave C tile presents it "as of …".

```ts
const AirQualityProfileSchema = z.object({
  city: z.string(),                                  // slug
  reportingArea: z.string(),
  observedAt: z.string(),                            // "2026-05-30 15:00 PST"
  dominantParameter: z.enum(AQI_PARAMETERS).nullable(),
  aqi: z.number().int().min(0),                      // headline = worst parameter
  category: z.enum(AQI_CATEGORIES),                  // "Good" | "Moderate" | …
  readings: z.array(z.object({ parameter, aqi, category })),
  source: z.string().optional(),
});
```
Loader `getAirQualityProfile(slug)` returns `null` when a city has no snapshot. Source `air-quality-airnow-2026` (live).

### `WalkabilityProfile` — `/data/walkability/<slug>.json` (`schemas/walkability.ts`) — NEW (Wave B; EPA swap Wave C, AD-034)

The **EPA National Walkability Index** (Smart Location Database), pulled live from EPA's GeoPlatform ArcGIS service (public domain). The block-group `NatWalkInd` (1–20) is population-weighted (`TotPop`) across the block groups within a ~10 km envelope of the centroid and mapped to a 0–100 `score`; category cuts at 25/50/75 are EPA's own tier boundaries. **Tier `live`** (`walkability-epa-2026`). Supersedes the Wave B single-centroid OSM proxy.

```ts
const WalkabilityProfileSchema = z.object({
  city: z.string(),                                  // slug
  score: z.number().int().min(0).max(100),           // NatWalkInd mapped to 0–100
  category: z.enum(["car-dependent","somewhat-walkable","very-walkable","walker-paradise"]),
  natWalkInd: z.number().min(0).max(20),             // EPA index (1–20), pop-weighted
  blockGroupCount: z.number().int().nonnegative(),   // block groups averaged
  population: z.number().int().nonnegative(),         // weighting denominator
  source: z.string().optional(),
});
```
Loader `getWalkabilityProfile(slug)` returns `null` when absent.

### Wave B — SHIPPED 2026-05-30

- **Relocations (B.1–B.4):** `relocations` Supabase table (`RelocationSchema` + migration `0020`); nullable `relocation_id` on `destinations` + `saved_neighborhoods` (`0021`/`0022`); active "Long Beach move" seed + backfill (`0023`). Single-user RLS literal-UUID pattern + GRANTs + partial unique index `WHERE is_active_move`. Applied live via Supabase MCP.
- **Ingestion (B.5–B.6, AD-030):** `scripts/ingest-city.ts` live-overlays NOAA climate temps (`live`), HUD 2BR rent (`live`), AirNow AQI (`live`), and OSM walkability (`modeled`) onto hand-authored modeled bases; flood/wildfire/earthquake/sea-level stay hand-verified at city grain (FEMA NFHL/NRI are logged cross-checks). Sacramento crime/climate/cost/community authored (Sacramento sample properties deferred to Wave C); Denver/LB regenerated with live source tiers. `data/data-sources.json` gains `climate-noaa-2026`, `rent-hud-fmr-2026`, `air-quality-airnow-2026`, `walkability-osm-2026`, `crime-sac-2024`.

### Wave C — SHIPPED 2026-05-31 (AD-032…034)

- **Loaders:** `getCrimeRecord`/`getClimateProfile` resolve by any registry slug (Sacramento renders). `resolveViewingRelocation`/`getViewingRelocation`/`moveContextFor`/`toRelocationOption` added to `relocation-db.ts`; `citySlugFromName` added to `cities.ts`.
- **Schema changes:** `WalkabilityProfileSchema` swaps `poiCount`/`radiusMeters` → `natWalkInd`/`blockGroupCount`/`population`, tier `modeled`→`live` (AD-034). `NeighborhoodSummary` gains `citySlug`+`cityCode`; `NeighborhoodCompareColumn.city`/`cityCode` widen to `string` (slug-generic). No Supabase schema change — the `relocations` table + `relocation_id` hooks from Wave B are unchanged; Wave C only read/wrote rows (seeded the Sacramento what-if).
- **Data:** `data/walkability/*.json` regenerated from the EPA index; `data/data-sources.json` flips `walkability-osm-2026` → `walkability-epa-2026` (live); `data/properties.json` gains 6 Sacramento sample listings.
- **Provenance:** `<SourceTag>`/`<SourceTagList>` render the `source` id (resolved via `getDataSource`) as a muted line on every reference surface.


---

## Migration index — 0009 through 0024 (added Wave 6, AD-044)

The sections above describe v1 (0001–0002), the lease module (0003–0008), and Phase 8 relocations (0020–0023) in prose. The remaining migrations, previously undocumented here:

| Migration | What it does |
|---|---|
| `0009_checklist_unique_seedkey.sql` | `UNIQUE(user_id, category, order_index)` on `checklist_items` + race-safe seeding via upsert (AD-014/015 dedupe fix). |
| `0010_destinations_address_split.sql` | Splits destination address into `street_address` / `city` / `state_code` / `zip_code`. |
| `0011_utility_transitions.sql` | `utility_transitions` — kind/side/status lifecycle rows for shut-offs + turn-ons (Phase 7). |
| `0012_address_change_targets.sql` | `address_change_targets` — who needs the new address, due dates from lead-day table (Phase 7). |
| `0013_move_estimates.sql` | `move_estimates` — one row per user, `scenarios` JSONB (Zod: `schemas/move-cost.ts`). |
| `0014_move_out_walkthroughs.sql` | `move_out_walkthroughs` — header row for the deposit-defense walkthrough (Zod: `schemas/move-out.ts`). |
| `0015_move_out_room_records.sql` | `move_out_room_records` — per-room ratings + status fields, FK to walkthrough. |
| `0016_geocoded_addresses.sql` | `lat`/`lng` on `destinations` + `origin_lat`/`origin_lng` on `lease_terms` (Nominatim geocode). |
| `0017_checklist_merge_pre_move.sql` | Merges the pre-move-90d/30d buckets into `pre-move` (seed slim-down). |
| `0018_checklist_reorder_rpc.sql` | First `reorder_checklist_item` RPC (superseded by 0024). |
| `0019_saved_neighborhoods.sql` | `saved_neighborhoods` — heart-save rows, `UNIQUE(user_id, neighborhood, city)`. |
| `0024_checklist_reorder_transient_safe.sql` | Rewrites the reorder RPC through a disjoint negative range so the 0009 unique index can't trip mid-shuffle (AD-038). |

All tables were created with the single-user RLS literal-UUID pattern and GRANTs to `anon` / `authenticated` / `service_role`; migration 0025 leaves only the `service_role` grants (see `docs/security-lockdown.md`). `relocation_id` columns from 0021/0022 exist on `destinations` + `saved_neighborhoods` but are not yet read anywhere (open call — audit plan §3.3).
