// NeighborhoodCompareTable — saved-neighborhoods side-by-side compare matrix.
//
// Same layout idiom as <DestinationsCompareTable>: md+ CSS grid with sticky-
// left attribute column + N data columns; <md stacked cards. No active-column
// highlight — saved neighborhoods don't carry an "active" concept the way
// destinations do.

import Link from "next/link";
import type {
  ClimateConcern,
  NeighborhoodCompareColumn,
  NeighborhoodCompareView,
} from "@/lib/data/neighborhood-compare";

interface NeighborhoodCompareTableProps {
  view: NeighborhoodCompareView;
}

const fmtCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const DASH = "—";

type GroupKey = "location" | "listings" | "crime" | "climate";

const GROUP_LABELS: Record<GroupKey, string> = {
  location: "LOCATION",
  listings: "LISTINGS",
  crime: "CRIME",
  climate: "CLIMATE",
};

const GROUP_SUB_LABEL: Partial<Record<GroupKey, string>> = {
  crime: "City-level data",
};

const GROUP_ORDER: GroupKey[] = ["location", "listings", "crime", "climate"];

type Row = {
  group: GroupKey;
  label: string;
  render: (col: NeighborhoodCompareColumn) => React.ReactNode;
};

function muted(s: string): React.ReactNode {
  return <span className="text-muted-foreground">{s}</span>;
}

function renderRent(n: number | null): React.ReactNode {
  if (n == null) return muted(DASH);
  return <span className="mono-num">{fmtCurrency.format(n)}/mo</span>;
}

function renderSeaProximity(km: number): React.ReactNode {
  if (km <= 0) return muted(DASH);
  return (
    <span>
      <span className="mono-num">{km.toFixed(1)}</span> km
    </span>
  );
}

function renderTopCrime(
  cats: { subcategory: string; per1k: number }[],
): React.ReactNode {
  if (cats.length === 0) return muted(DASH);
  return (
    <ul className="flex flex-col gap-1">
      {cats.map((c) => (
        <li key={c.subcategory} className="text-xs text-foreground">
          {c.subcategory}{" "}
          <span className="mono-num text-muted-foreground">
            ({c.per1k.toFixed(1)}/1k)
          </span>
        </li>
      ))}
    </ul>
  );
}

function climateConcernClass(c: ClimateConcern): string {
  switch (c.kind) {
    case "flood":
    case "wildfire":
    case "earthquake":
    case "heat":
      return "text-[var(--danger)]";
    case "sea-level":
      return "text-[var(--warn)]";
    case "low":
      return "text-muted-foreground";
  }
}

function renderClimateConcerns(concerns: ClimateConcern[]): React.ReactNode {
  if (concerns.length === 0) return muted(DASH);
  return (
    <ul className="flex flex-col gap-1">
      {concerns.map((c) => (
        <li key={c.kind} className={`text-xs ${climateConcernClass(c)}`}>
          {c.label}
        </li>
      ))}
    </ul>
  );
}

const ROWS: Row[] = [
  {
    group: "location",
    label: "Neighborhood",
    render: (c) => <span className="text-foreground">{c.neighborhood}</span>,
  },
  {
    group: "location",
    label: "City",
    render: (c) => (
      <span>
        <span className="text-foreground">{c.city}</span>{" "}
        <span className="mono-num text-[10px] tracking-wider text-muted-foreground">
          {c.cityCode}
        </span>
      </span>
    ),
  },
  {
    group: "location",
    label: "Sea proximity",
    render: (c) => renderSeaProximity(c.avgSeaProximityKm),
  },
  {
    group: "listings",
    label: "Listings",
    render: (c) => <span className="mono-num">{c.listingCount}</span>,
  },
  {
    group: "listings",
    label: "Avg rent (rentals)",
    render: (c) => renderRent(c.avgRentMonthly),
  },
  {
    group: "listings",
    label: "Bed range",
    render: (c) => <span className="text-foreground">{c.bedRangeLabel}</span>,
  },
  {
    group: "crime",
    label: "Top crime categories",
    render: (c) => renderTopCrime(c.topCrimeCategories),
  },
  {
    group: "climate",
    label: "Top concerns",
    render: (c) => renderClimateConcerns(c.topClimateConcerns),
  },
];

export function NeighborhoodCompareTable({
  view,
}: NeighborhoodCompareTableProps) {
  const { columns } = view;
  return (
    <>
      <div className="hidden md:block">
        <DesktopGrid columns={columns} />
      </div>
      <div className="space-y-4 md:hidden">
        {columns.map((col) => (
          <NeighborhoodCard key={col.key} column={col} />
        ))}
      </div>
    </>
  );
}

function ColumnHeader({ column }: { column: NeighborhoodCompareColumn }) {
  return (
    <Link
      href={`/properties/${column.slug}`}
      className="flex flex-col gap-0.5 text-foreground underline-offset-2 hover:underline"
    >
      <span className="text-xs font-semibold">{column.neighborhood}</span>
      <span className="mono-num text-[10px] tracking-wider text-muted-foreground">
        {column.cityCode}
      </span>
    </Link>
  );
}

function DesktopGrid({ columns }: { columns: NeighborhoodCompareColumn[] }) {
  const n = columns.length;
  const gridStyle: React.CSSProperties = {
    gridTemplateColumns: `minmax(160px, 220px) repeat(${n}, minmax(180px, 1fr))`,
  };

  return (
    <div role="table" aria-label="Saved neighborhoods compare" className="text-xs">
      <div role="row" className="grid items-end gap-x-px" style={gridStyle}>
        <div role="columnheader" className="px-3 py-3" />
        {columns.map((col) => (
          <div key={col.key} role="columnheader" className="px-3 py-3">
            <ColumnHeader column={col} />
          </div>
        ))}
      </div>

      {GROUP_ORDER.map((g) => {
        const rows = ROWS.filter((r) => r.group === g);
        if (rows.length === 0) return null;
        return (
          <div key={g} role="rowgroup" className="border-t border-border">
            <div role="row" className="grid gap-x-px" style={gridStyle}>
              <div
                role="rowheader"
                className="flex flex-col gap-0.5 px-3 py-2"
              >
                <span className="label-cap text-[9px] tracking-wider text-muted-foreground">
                  {GROUP_LABELS[g]}
                </span>
                {GROUP_SUB_LABEL[g] && (
                  <span className="text-[10px] text-muted-foreground">
                    {GROUP_SUB_LABEL[g]}
                  </span>
                )}
              </div>
              {columns.map((col) => (
                <div key={col.key} className="px-3 py-2" />
              ))}
            </div>
            {rows.map((row) => (
              <div
                key={row.label}
                role="row"
                className="grid items-start gap-x-px border-t border-border"
                style={gridStyle}
              >
                <div role="rowheader" className="px-3 py-2 text-muted-foreground">
                  {row.label}
                </div>
                {columns.map((col) => (
                  <div
                    key={col.key}
                    role="cell"
                    className="px-3 py-2 text-foreground"
                  >
                    {row.render(col)}
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

function NeighborhoodCard({ column }: { column: NeighborhoodCompareColumn }) {
  return (
    <article className="rounded-[var(--radius-sm)] border border-border bg-background/40">
      <header className="border-b border-border px-4 py-3">
        <ColumnHeader column={column} />
      </header>
      <div className="divide-y divide-border">
        {GROUP_ORDER.map((g) => {
          const rows = ROWS.filter((r) => r.group === g);
          if (rows.length === 0) return null;
          return (
            <section key={g} className="px-4 py-3">
              <div className="flex flex-col gap-0.5">
                <span className="label-cap text-[9px] tracking-wider text-muted-foreground">
                  {GROUP_LABELS[g]}
                </span>
                {GROUP_SUB_LABEL[g] && (
                  <span className="text-[10px] text-muted-foreground">
                    {GROUP_SUB_LABEL[g]}
                  </span>
                )}
              </div>
              <dl className="mt-2 grid grid-cols-[1fr_1fr] gap-x-3 gap-y-1.5 text-xs">
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
