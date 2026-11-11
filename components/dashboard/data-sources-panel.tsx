import { Database } from "lucide-react";
import { getDataSources } from "@/lib/data/data-sources";
import { isStale, sourceStaleThreshold } from "@/lib/data/staleness";
import type { DataSource } from "@/schemas";

// Replaces the old "System Status" row (Wave D, D.3). That panel showed
// developer scaffolding — Scaffold / Tokens / Schemas / Supabase / Integrations,
// truncated to single letters — which means nothing to a household user and
// violated the User-facing copy rule. This reframes the same screen real estate
// into something honest and useful: where the dashboard's numbers come from and
// how fresh they are, read straight from the provenance registry (AD-031).

const TIER_ORDER: Record<DataSource["tier"], number> = {
  live: 0,
  modeled: 1,
  community: 2,
};

const TIER_LABEL: Record<DataSource["tier"], string> = {
  live: "Live",
  modeled: "Modeled",
  community: "Community",
};

// Live is reassuring (ok). Modeled is neutral — it's an honest estimate, not a
// problem, so it stays muted rather than amber. Community is informational.
const TIER_DOT: Record<DataSource["tier"], string> = {
  live: "bg-[var(--ok)]",
  modeled: "bg-muted-foreground",
  community: "bg-[var(--info)]",
};

const TIER_TEXT: Record<DataSource["tier"], string> = {
  live: "text-[var(--ok)]",
  modeled: "text-muted-foreground",
  community: "text-[var(--info)]",
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatFetched(iso: string): string {
  const [y, m] = iso.split("-");
  const month = MONTHS[Number(m) - 1];
  return month ? `${month} ${y}` : y;
}

export function DataSourcesPanel() {
  const sources = [...getDataSources()].sort(
    (a, b) =>
      TIER_ORDER[a.tier] - TIER_ORDER[b.tier] ||
      b.fetchedAt.localeCompare(a.fetchedAt),
  );

  const liveCount = sources.filter((s) => s.tier === "live").length;
  const modeledCount = sources.filter((s) => s.tier === "modeled").length;
  const communityCount = sources.filter((s) => s.tier === "community").length;

  const summary = [
    liveCount > 0 ? `${liveCount} live` : null,
    modeledCount > 0 ? `${modeledCount} modeled` : null,
    communityCount > 0 ? `${communityCount} community` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-card p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--info)]/14">
            <Database className="size-4 text-[var(--info)]" strokeWidth={1.75} />
          </span>
          <div>
            <h2 className="text-lg font-medium tracking-[var(--tracking-headline)] text-foreground">
              Data sources
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Where these numbers come from, and how fresh they are.
            </p>
          </div>
        </div>
        <span className="mono-num shrink-0 text-[10px] text-muted-foreground">
          {summary}
        </span>
      </header>

      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {sources.map((src) => {
          // Tier ≠ freshness (AD-041): a live source whose snapshot has aged
          // past its kind's threshold shows amber, not a reassuring green.
          const stale = isStale(src.fetchedAt, sourceStaleThreshold(src));
          return (
            <li
              key={src.id}
              className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border/70 bg-background/40 px-3 py-2.5"
              title={src.notes ? `${src.provider} — ${src.notes}` : src.provider}
            >
              <span
                aria-hidden="true"
                className={`size-2 shrink-0 rounded-full ${
                  stale ? "bg-[var(--warn)]" : TIER_DOT[src.tier]
                }`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-foreground">
                  {src.label}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {src.provider}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p
                  className={`label-cap text-[9px] ${
                    stale ? "text-[var(--warn)]" : TIER_TEXT[src.tier]
                  }`}
                >
                  {stale ? "Needs refresh" : TIER_LABEL[src.tier]}
                </p>
                <p className="mono-num text-[10px] text-muted-foreground">
                  {formatFetched(src.fetchedAt)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
