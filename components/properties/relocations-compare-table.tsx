// RelocationsCompareTable — two (or more) relocations side by side, reduced to
// their destination-city reference facts. Reuses the destinations-compare idiom:
//   - md+: CSS grid, attribute column on the left, one column per relocation;
//     the active move gets a coral 1px left-border (warm-decoration vocabulary).
//   - <md: stacked cards, one per relocation; active gets a coral left-border.
// Pure RSC. Rows grouped by reference domain (cost / crime / climate / air /
// walkability / community) per design §4.3.

import type { RelocationCompareColumn } from "@/lib/data/relocation-compare";

const fmtCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const DASH = "—";

type GroupKey =
  | "cost"
  | "crime"
  | "climate"
  | "air"
  | "walkability"
  | "community";

type Row = {
  group: GroupKey;
  label: string;
  render: (c: RelocationCompareColumn) => React.ReactNode;
};

const GROUP_LABELS: Record<GroupKey, string> = {
  cost: "COST",
  crime: "CRIME",
  climate: "CLIMATE",
  air: "AIR QUALITY",
  walkability: "WALKABILITY",
  community: "COMMUNITY",
};

const GROUP_ORDER: GroupKey[] = [
  "cost",
  "crime",
  "climate",
  "air",
  "walkability",
  "community",
];

// Render helpers ────────────────────────────────────────────────────────────

function muted(s: string): React.ReactNode {
  return <span className="text-muted-foreground">{s}</span>;
}

function money(n: number | null): React.ReactNode {
  return n == null ? (
    muted(DASH)
  ) : (
    <span className="mono-num">{fmtCurrency.format(n)}</span>
  );
}

function num(n: number | null, suffix = ""): React.ReactNode {
  return n == null ? (
    muted(DASH)
  ) : (
    <span className="mono-num">
      {n}
      {suffix}
    </span>
  );
}

function text(s: string | null): React.ReactNode {
  return s == null ? muted(DASH) : <span>{s}</span>;
}

// Higher cost than your origin reads warn; lower reads ok — same tone idiom as
// the destinations Δ cell.
function costDelta(pct: number | null): React.ReactNode {
  if (pct == null) return muted(DASH);
  const sign = pct >= 0 ? "+" : "";
  const cls = pct >= 0 ? "text-[var(--warn)]" : "text-[var(--ok)]";
  return (
    <span className={`mono-num ${cls}`}>
      {sign}
      {pct.toFixed(1)}%
    </span>
  );
}

const ROWS: Row[] = [
  { group: "cost", label: "Monthly cost", render: (c) => money(c.costMonthly) },
  {
    group: "cost",
    label: "Vs. your origin",
    render: (c) => costDelta(c.costVsOriginPct),
  },

  { group: "crime", label: "Violent / 1k", render: (c) => num(c.violentPer1k) },
  {
    group: "crime",
    label: "Property / 1k",
    render: (c) => num(c.propertyPer1k),
  },

  { group: "climate", label: "Flood zone", render: (c) => text(c.floodTier) },
  {
    group: "climate",
    label: "Wildfire score",
    render: (c) => num(c.wildfireScore, " / 100"),
  },
  { group: "climate", label: "Hot days / yr", render: (c) => num(c.heatDays) },
  {
    group: "climate",
    label: "Avg. high",
    render: (c) => num(c.avgHighF, "°F"),
  },

  { group: "air", label: "Air quality index", render: (c) => num(c.aqi) },
  { group: "air", label: "Rating", render: (c) => text(c.aqiCategory) },

  { group: "walkability", label: "Walk score", render: (c) => num(c.walkScore) },
  {
    group: "walkability",
    label: "Rating",
    render: (c) => text(c.walkCategory),
  },

  {
    group: "community",
    label: "Typical 2-bed rent",
    render: (c) => money(c.rent2br),
  },
  {
    group: "community",
    label: "Neighborhood vibes",
    render: (c) => num(c.vibeCount),
  },
];

// Column header ──────────────────────────────────────────────────────────────

function ColumnHeader({ column }: { column: RelocationCompareColumn }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-foreground">
        {column.label}
      </span>
      <span className="mono-num text-[10px] text-muted-foreground">
        {column.originCode} → {column.destinationCode}
      </span>
      {column.isActive && (
        <span className="label-cap mt-0.5 inline-flex w-fit items-center rounded-[var(--radius-sm)] border border-[var(--ok)]/40 px-1.5 py-0.5 text-[8px] text-[var(--ok)]">
          Active move
        </span>
      )}
    </div>
  );
}

// Component ─────────────────────────────────────────────────────────────────

export function RelocationsCompareTable({
  columns,
}: {
  columns: RelocationCompareColumn[];
}) {
  return (
    <>
      {/* Desktop grid (md+) */}
      <div className="hidden md:block">
        <DesktopGrid columns={columns} />
      </div>
      {/* Mobile stack (<md) */}
      <div className="space-y-4 md:hidden">
        {columns.map((c) => (
          <RelocationCard key={c.id} column={c} />
        ))}
      </div>
    </>
  );
}

function DesktopGrid({ columns }: { columns: RelocationCompareColumn[] }) {
  const gridStyle: React.CSSProperties = {
    gridTemplateColumns: `minmax(160px, 220px) repeat(${columns.length}, minmax(160px, 1fr))`,
  };

  return (
    <div role="table" aria-label="Relocations compare" className="text-xs">
      {/* Header row */}
      <div role="row" className="grid items-end gap-x-px" style={gridStyle}>
        <div role="columnheader" className="px-3 py-3" />
        {columns.map((c) => (
          <div
            key={c.id}
            role="columnheader"
            className={`px-3 py-3 ${
              c.isActive ? "border-l border-l-[var(--brand-secondary)]" : ""
            }`}
          >
            <ColumnHeader column={c} />
          </div>
        ))}
      </div>

      {GROUP_ORDER.map((g) => {
        const groupRows = ROWS.filter((r) => r.group === g);
        return (
          <div key={g} role="rowgroup" className="border-t border-border">
            <div role="row" className="grid gap-x-px" style={gridStyle}>
              <div
                role="rowheader"
                className="label-cap px-3 py-2 text-[9px] tracking-wider text-muted-foreground"
              >
                {GROUP_LABELS[g]}
              </div>
              {columns.map((c) => (
                <div
                  key={c.id}
                  className={`px-3 py-2 ${
                    c.isActive
                      ? "border-l border-l-[var(--brand-secondary)]"
                      : ""
                  }`}
                />
              ))}
            </div>
            {groupRows.map((row) => (
              <div
                key={row.label}
                role="row"
                className="grid items-start gap-x-px border-t border-border"
                style={gridStyle}
              >
                <div role="rowheader" className="px-3 py-2 text-muted-foreground">
                  {row.label}
                </div>
                {columns.map((c) => (
                  <div
                    key={c.id}
                    role="cell"
                    className={`px-3 py-2 text-foreground ${
                      c.isActive
                        ? "border-l border-l-[var(--brand-secondary)]"
                        : ""
                    }`}
                  >
                    {row.render(c)}
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

function RelocationCard({ column }: { column: RelocationCompareColumn }) {
  return (
    <article
      className={`rounded-[var(--radius-sm)] border bg-background/40 ${
        column.isActive
          ? "border-l-2 border-l-[var(--brand-secondary)] border-y-border border-r-border"
          : "border-border"
      }`}
    >
      <header className="border-b border-border px-4 py-3">
        <ColumnHeader column={column} />
      </header>
      <div className="divide-y divide-border">
        {GROUP_ORDER.map((g) => {
          const rows = ROWS.filter((r) => r.group === g);
          return (
            <section key={g} className="px-4 py-3">
              <div className="label-cap mb-2 text-[9px] tracking-wider text-muted-foreground">
                {GROUP_LABELS[g]}
              </div>
              <dl className="grid grid-cols-[1fr_1fr] gap-x-3 gap-y-1.5 text-xs">
                {rows.map((row) => (
                  <Cell key={row.label} label={row.label}>
                    {row.render(column)}
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
