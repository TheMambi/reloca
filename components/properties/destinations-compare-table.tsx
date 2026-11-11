// DestinationsCompareTable — side-by-side destination compare matrix.
//
// Two layouts share one row schema:
//   - md+: CSS grid, attribute column on the left, one column per destination.
//     Active column gets a coral 1px left-border (warm-decoration vocabulary).
//   - <md: stacked cards, one per destination. Active card gets a coral
//     left-border. Each card renders the rows as label/value pairs grouped
//     by section.
//
// Pure RSC. Δ vs HUD FMR is computed client-side from `monthly_rent_low` +
// `hud_fmr_2br` per design §5.1. Walk / Transit / Bike rows render `—`
// because the Walk Score module is deferred (AD-018); the rows are kept so
// the table layout matches the documented spec and a future un-deferral
// just starts populating those cells.

import type { Destination } from "@/schemas/lease";
import { DestinationColumnControls } from "./destination-column-controls";

interface DestinationsCompareTableProps {
  destinations: Destination[];
}

// Renders "Long Beach, CA 90802" when all 3 are present, dropping the parts
// that aren't. Falls back to bare city when only city is set.
function formatLocation(d: Destination): string {
  const tail = [d.state_code, d.zip_code].filter(Boolean).join(" ");
  if (d.city && tail) return `${d.city}, ${tail}`;
  return d.city;
}

const fmtCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const DASH = "—";

type GroupKey =
  | "identity"
  | "money"
  | "physical"
  | "scores"
  | "amenities"
  | "insurance"
  | "petlease"
  | "bookkeeping";

type Row = {
  group: GroupKey;
  label: string;
  render: (d: Destination) => React.ReactNode;
};

const GROUP_LABELS: Record<GroupKey, string> = {
  identity: "ADDRESS",
  money: "COST",
  physical: "UNIT SIZE",
  scores: "WALKABILITY",
  amenities: "AMENITIES",
  insurance: "RENTERS INSURANCE",
  petlease: "PETS & FURNISHING",
  bookkeeping: "RECORD",
};

// Render helpers ────────────────────────────────────────────────────────────

function money(n: number | null | undefined): React.ReactNode {
  return n == null
    ? muted(DASH)
    : <span className="mono-num">{fmtCurrency.format(n)}</span>;
}

function num(n: number | null | undefined, suffix = ""): React.ReactNode {
  return n == null
    ? muted(DASH)
    : <span className="mono-num">{n}{suffix}</span>;
}

function bool(v: boolean | null | undefined): React.ReactNode {
  if (v == null) return muted("—");
  return v ? "Yes" : "No";
}

function muted(s: string): React.ReactNode {
  return <span className="text-muted-foreground">{s}</span>;
}

function deltaVsBenchmark(
  rentLow: number | null,
  benchmark: number | null,
  benchmarkYear: number | null,
): React.ReactNode {
  if (rentLow == null || benchmark == null) return muted(DASH);
  const pct = Math.round(((rentLow - benchmark) / benchmark) * 100 * 10) / 10;
  const sign = pct >= 0 ? "+" : "";
  const cls = pct >= 0 ? "text-[var(--warn)]" : "text-[var(--ok)]";
  const yearLabel = benchmarkYear ? ` (${benchmarkYear})` : "";
  // Tooltip surfaces the underlying source for users who want to dig in,
  // without putting the acronym in the row label itself.
  return (
    <span
      className={`mono-num ${cls}`}
      title={`Local 2-bed benchmark${yearLabel}: ${fmtCurrency.format(benchmark)}. Source: HUD Fair Market Rent for this metro.`}
    >
      {sign}{pct.toFixed(1)}%
    </span>
  );
}

function renderAmenities(d: Destination): React.ReactNode {
  if (!d.amenities || d.amenities.length === 0) return muted(DASH);
  return (
    <ul className="flex flex-wrap gap-1">
      {d.amenities.map((a) => (
        <li
          key={a}
          className="rounded-[var(--radius-sm)] border border-border bg-background/40 px-1.5 py-0.5 text-[10px] text-foreground"
        >
          {a}
        </li>
      ))}
    </ul>
  );
}

function renderSourceUrl(d: Destination): React.ReactNode {
  if (!d.source_url) return muted(DASH);
  let host: string;
  try {
    host = new URL(d.source_url).hostname.replace(/^www\./, "");
  } catch {
    host = d.source_url;
  }
  return (
    <a
      href={d.source_url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-foreground underline-offset-2 hover:underline"
    >
      {host}
    </a>
  );
}

function renderEntryMode(d: Destination): React.ReactNode {
  const map: Record<Destination["fetch_status"], { label: string; cls: string }> = {
    verified: { label: "Verified", cls: "text-[var(--ok)]" },
    needs_review: { label: "Needs review", cls: "text-[var(--warn)]" },
    fetch_failed: {
      label: "Couldn't load website",
      cls: "text-[var(--danger)]",
    },
    manual: { label: "Entered by hand", cls: "text-muted-foreground" },
  };
  const v = map[d.fetch_status];
  return <span className={v.cls}>{v.label}</span>;
}

// Row schema ────────────────────────────────────────────────────────────────

const ROWS: Row[] = [
  // identity
  { group: "identity", label: "Address", render: (d) => d.street_address },
  { group: "identity", label: "Location", render: (d) => formatLocation(d) },

  // money
  { group: "money", label: "Rent (low)", render: (d) => money(d.monthly_rent_low) },
  { group: "money", label: "Rent (high)", render: (d) => money(d.monthly_rent_high) },
  {
    group: "money",
    label: "Vs. typical 2-bed in this metro",
    render: (d) =>
      deltaVsBenchmark(d.monthly_rent_low, d.hud_fmr_2br, d.hud_fmr_year),
  },
  { group: "money", label: "Application fee", render: (d) => money(d.application_fee) },
  { group: "money", label: "Security deposit", render: (d) => money(d.security_deposit) },
  { group: "money", label: "Pet rent / mo", render: (d) => money(d.pet_rent_monthly) },
  { group: "money", label: "Parking / mo", render: (d) => money(d.parking_monthly) },

  // physical
  { group: "physical", label: "Bedrooms", render: (d) => num(d.beds) },
  { group: "physical", label: "Bathrooms", render: (d) => num(d.baths) },
  { group: "physical", label: "Square feet", render: (d) => num(d.sqft) },

  // scores — Walk Score signup is on hold; cells render — until we have a key.
  { group: "scores", label: "Walking score", render: (d) => num(d.walk_score) },
  { group: "scores", label: "Transit score", render: (d) => num(d.transit_score) },
  { group: "scores", label: "Biking score", render: (d) => num(d.bike_score) },

  // amenities
  { group: "amenities", label: "Amenities", render: renderAmenities },

  // insurance
  {
    group: "insurance",
    label: "Required by landlord",
    render: (d) => bool(d.insurance_required),
  },
  {
    group: "insurance",
    label: "Min liability coverage",
    render: (d) => money(d.insurance_min_liability),
  },
  {
    group: "insurance",
    label: "Min belongings coverage",
    render: (d) => money(d.insurance_min_property),
  },

  // pets + furnishing
  {
    group: "petlease",
    label: "Pets allowed",
    render: (d) => bool(d.pets_allowed),
  },
  {
    group: "petlease",
    label: "Comes furnished",
    render: (d) => bool(d.furnished),
  },

  // record
  { group: "bookkeeping", label: "Website", render: renderSourceUrl },
  {
    group: "bookkeeping",
    label: "How this was entered",
    render: renderEntryMode,
  },
  {
    group: "bookkeeping",
    label: "Notes",
    render: (d) =>
      d.notes ? (
        <span className="block whitespace-pre-wrap text-xs text-foreground">
          {d.notes}
        </span>
      ) : (
        muted(DASH)
      ),
  },
];

const GROUP_ORDER: GroupKey[] = [
  "identity",
  "money",
  "physical",
  "scores",
  "amenities",
  "insurance",
  "petlease",
  "bookkeeping",
];

// Component ─────────────────────────────────────────────────────────────────

export function DestinationsCompareTable({
  destinations,
}: DestinationsCompareTableProps) {
  // Active first, then most-recently-created. The schema's partial unique
  // index guarantees at most one active.
  const ordered = [...destinations].sort((a, b) => {
    if (a.is_active_target && !b.is_active_target) return -1;
    if (!a.is_active_target && b.is_active_target) return 1;
    return b.created_at.localeCompare(a.created_at);
  });

  return (
    <>
      {/* Desktop grid (md+) */}
      <div className="hidden md:block">
        <DesktopGrid destinations={ordered} />
      </div>
      {/* Mobile stack (<md) */}
      <div className="space-y-4 md:hidden">
        {ordered.map((d) => (
          <DestinationCard key={d.id} destination={d} />
        ))}
      </div>
    </>
  );
}

// Desktop grid layout ──────────────────────────────────────────────────────

function DesktopGrid({ destinations }: { destinations: Destination[] }) {
  const columns = destinations.length;
  // First column: attribute label. Then N destination columns.
  const gridStyle: React.CSSProperties = {
    gridTemplateColumns: `minmax(160px, 220px) repeat(${columns}, minmax(180px, 1fr))`,
  };

  return (
    <div role="table" aria-label="Properties compare" className="text-xs">
      {/* Header row: building names + edit / delete controls */}
      <div role="row" className="grid items-end gap-x-px" style={gridStyle}>
        <div role="columnheader" className="px-3 py-3" />
        {destinations.map((d) => (
          <div
            key={d.id}
            role="columnheader"
            className={`px-3 py-3 ${
              d.is_active_target
                ? "border-l border-l-[var(--brand-secondary)]"
                : ""
            }`}
          >
            <DestinationColumnControls destination={d} />
          </div>
        ))}
      </div>

      {GROUP_ORDER.map((g) => {
        const groupRows = ROWS.filter((r) => r.group === g);
        if (groupRows.length === 0) return null;
        return (
          <div key={g} role="rowgroup" className="border-t border-border">
            {/* Group header */}
            <div role="row" className="grid gap-x-px" style={gridStyle}>
              <div
                role="rowheader"
                className="label-cap px-3 py-2 text-[9px] tracking-wider text-muted-foreground"
              >
                {GROUP_LABELS[g]}
              </div>
              {destinations.map((d) => (
                <div
                  key={d.id}
                  className={`px-3 py-2 ${
                    d.is_active_target
                      ? "border-l border-l-[var(--brand-secondary)]"
                      : ""
                  }`}
                />
              ))}
            </div>
            {/* Rows in this group */}
            {groupRows.map((row) => (
              <div
                key={row.label}
                role="row"
                className="grid items-start gap-x-px border-t border-border"
                style={gridStyle}
              >
                <div
                  role="rowheader"
                  className="px-3 py-2 text-muted-foreground"
                >
                  {row.label}
                </div>
                {destinations.map((d) => (
                  <div
                    key={d.id}
                    role="cell"
                    className={`px-3 py-2 text-foreground ${
                      d.is_active_target
                        ? "border-l border-l-[var(--brand-secondary)]"
                        : ""
                    }`}
                  >
                    {row.render(d)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// Mobile stacked card ──────────────────────────────────────────────────────

function DestinationCard({ destination }: { destination: Destination }) {
  const isActive = destination.is_active_target;
  return (
    <article
      className={`rounded-[var(--radius-sm)] border bg-background/40 ${
        isActive
          ? "border-l-2 border-l-[var(--brand-secondary)] border-y-border border-r-border"
          : "border-border"
      }`}
    >
      <header className="border-b border-border px-4 py-3">
        <DestinationColumnControls destination={destination} />
      </header>
      <div className="divide-y divide-border">
        {GROUP_ORDER.map((g) => {
          const rows = ROWS.filter((r) => r.group === g);
          if (rows.length === 0) return null;
          return (
            <section key={g} className="px-4 py-3">
              <div className="label-cap mb-2 text-[9px] tracking-wider text-muted-foreground">
                {GROUP_LABELS[g]}
              </div>
              <dl className="grid grid-cols-[1fr_1fr] gap-x-3 gap-y-1.5 text-xs">
                {rows.map((row) => (
                  <Cell key={row.label} label={row.label}>
                    {row.render(destination)}
                  </Cell>
                ))}
              </dl>
            </section>
          );
        })}
      </div>
    </article>
  );
}

function Cell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{children}</dd>
    </>
  );
}
