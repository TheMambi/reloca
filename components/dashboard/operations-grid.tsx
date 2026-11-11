import Link from "next/link";
import {
  TrendingUp,
  Home,
  Users,
  CheckSquare,
  ArrowRight,
} from "lucide-react";
import { Donut } from "@/components/shared/mini-charts";
import { LeaseCard } from "./lease-card";
import { UtilitiesCard } from "./utilities-card";
import { AddressUpdatesCard } from "./address-updates-card";
import { MovingCostCard } from "./moving-cost-card";
import { MoveOutCard } from "./move-out-card";
import { AirQualityCard, type CityAir } from "./air-quality-card";
import { ClimateRiskCard, type CityClimate } from "./climate-risk-card";
import { SourceTag, SourceTagList } from "@/components/shared/source-tag";

/* ── Props from the dashboard RSC ── */

export type OperationsGridProps = {
  cost: {
    destTotal: number;
    deltaPct: number;
    categoryCount: number;
    destName: string;
    originName: string;
    sources: string[];
  };
  property: {
    listingCount: number;
    neighborhoodCount: number;
    savedCount: number;
    avgSeaMi: string;
    riskPosture: string;
    riskTone: "ok" | "warn" | "danger";
  };
  community: {
    vibeCount: number;
    avgTemp: number;
    testimonialCount: number;
    topNeighborhood: string;
    source: string | null;
  };
  checklist: {
    totalTasks: number;
    completedTasks: number;
    completePct: number;
    phaseCount: number;
    statutoryCount: number;
  };
  air: {
    origin: CityAir;
    destination: CityAir;
  };
  climate: {
    origin: CityClimate;
    destination: CityClimate;
  };
};

export function OperationsGrid({
  cost,
  property,
  community,
  checklist,
  air,
  climate,
}: OperationsGridProps) {
  // Dense, container-responsive tile grid (AD-004 instrumentation density,
  // Wave F). auto-fill + minmax packs as many ~340px tiles per row as the
  // column actually holds — 3–4 at 1920, more on ultrawide — regardless of the
  // sidebar's collapsed/expanded width (a viewport breakpoint can't see that).
  // `min(100%,340px)` keeps it a safe single column on phones. `items-start`
  // sizes each tile to its own content so a short tile (e.g. the checklist
  // donut) no longer stretches to a tall neighbour. The wide instruments (map,
  // timeline) render full-width at the page level, not here.
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] items-start gap-3">
      <CostCommuteCard cost={cost} />
      <PropertyCard property={property} />
      <CommunityCard community={community} />
      <AirQualityCard origin={air.origin} destination={air.destination} />
      <ClimateRiskCard origin={climate.origin} destination={climate.destination} />
      <ChecklistCard checklist={checklist} />
      <LeaseCard />
      <UtilitiesCard />
      <AddressUpdatesCard />
      <MovingCostCard />
      <MoveOutCard />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card primitive — shared by all four module cards                    */
/* ------------------------------------------------------------------ */

export function ModuleCard({
  href,
  icon,
  iconClass,
  iconBg,
  code,
  title,
  description,
  rightSlot,
  metaRow,
  ctaLabel,
  decoration,
  footnote,
}: {
  /** Detail-route href. Omit on tiles that are fully interactive in-tile
   *  (e.g. the relocation map) — the trailing CTA chip won't render. */
  href?: string;
  icon: React.ReactNode;
  iconClass: string;
  iconBg: string;
  code: string;
  title: string;
  description: string;
  rightSlot?: React.ReactNode;
  metaRow: React.ReactNode;
  ctaLabel?: string;
  decoration?: React.ReactNode;
  /** Muted provenance line for reference tiles (AD-031); omitted on execution tiles. */
  footnote?: React.ReactNode;
}) {
  return (
    <article className="group relative overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card p-4 transition-colors hover:bg-card/80">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className={`grid size-10 shrink-0 place-items-center rounded-[var(--radius-md)] ${iconBg}`}>
            <span className={iconClass}>{icon}</span>
          </span>
          <div>
            <p className={`label-cap text-[10px] tracking-[0.14em] ${iconClass}`}>{code}</p>
            <h2 className="mt-1.5 text-lg font-medium tracking-[var(--tracking-headline)] text-foreground">{title}</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
          </div>
        </div>
        {rightSlot}
      </div>

      {decoration}

      <div className="mt-4 flex items-end justify-between gap-3">
        <div className="flex items-end gap-3">{metaRow}</div>

        {href && ctaLabel && (
          <Link
            href={href}
            aria-label={`Open ${title}`}
            className="inline-flex items-center gap-1.5 self-end rounded-[var(--radius-md)] border border-border bg-background/40 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-foreground/25 hover:bg-background/70"
          >
            {ctaLabel}
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={1.75} />
          </Link>
        )}
      </div>

      {footnote && <div className="mt-3">{footnote}</div>}
    </article>
  );
}

export function MetaCell({
  value,
  label,
  tone = "default",
}: {
  value: string;
  label: string;
  tone?: "default" | "ok" | "warn" | "danger" | "muted";
}) {
  const toneClass = {
    default: "text-foreground",
    ok: "text-[var(--ok)]",
    warn: "text-[var(--warn)]",
    danger: "text-[var(--danger)]",
    muted: "text-muted-foreground",
  }[tone];

  return (
    <div>
      <p className={`mono-num text-lg font-medium ${toneClass}`}>{value}</p>
      <p className="label-cap mt-0.5 text-[9px] text-muted-foreground">{label}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cost & Commute — data-driven                                        */
/* ------------------------------------------------------------------ */

const fmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function CostCommuteCard({ cost }: { cost: OperationsGridProps["cost"] }) {
  const deltaSign = cost.deltaPct > 0 ? "+" : "";
  const deltaTone: "ok" | "warn" | "danger" =
    cost.deltaPct > 15 ? "danger" : cost.deltaPct > 0 ? "warn" : "ok";

  return (
    <ModuleCard
      href="/cost-of-living"
      icon={<TrendingUp className="size-5" strokeWidth={1.75} />}
      iconClass="text-[var(--ok)]"
      iconBg="bg-[var(--ok)]/14"
      code="COST & COMMUTE"
      title="Cost & Commute"
      description="Spend & savings."
      metaRow={
        <div className="grid flex-1 grid-cols-3 gap-3">
          <MetaCell value={fmt.format(cost.destTotal)} label={`${cost.destName} monthly`} />
          <MetaCell
            value={`${deltaSign}${cost.deltaPct.toFixed(1)}%`}
            label={`vs. ${cost.originName}`}
            tone={deltaTone}
          />
          <MetaCell value={String(cost.categoryCount)} label="Categories" tone="muted" />
        </div>
      }
      ctaLabel="Open"
      footnote={<SourceTagList ids={cost.sources} />}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Property — data-driven                                               */
/* ------------------------------------------------------------------ */

function PropertyCard({ property }: { property: OperationsGridProps["property"] }) {
  // No decorative right slot: the old synthetic sine-wave bars looked like an
  // instrument but plotted nothing (retired in Wave 4, AD-042).
  return (
    <ModuleCard
      href="/properties"
      icon={<Home className="size-5" strokeWidth={1.75} />}
      iconClass="text-[var(--brand-secondary)]"
      iconBg="bg-[var(--brand-secondary)]/14"
      code="PROPERTIES"
      title="Properties"
      description="Neighborhoods & buildings."
      metaRow={
        <div className="grid flex-1 grid-cols-3 gap-3">
          <MetaCell value={String(property.neighborhoodCount)} label="Neighborhoods" />
          <MetaCell value={String(property.savedCount)} label="Saved" />
          <MetaCell value={property.riskPosture} label="Risk posture" tone={property.riskTone} />
        </div>
      }
      ctaLabel="Open"
    />
  );
}

/* ------------------------------------------------------------------ */
/* Community — data-driven                                              */
/* ------------------------------------------------------------------ */

function CommunityCard({ community }: { community: OperationsGridProps["community"] }) {
  // The invented "Fit Score" gauge is gone (Wave 4, AD-042) — every number on
  // this tile is now a real one.
  return (
    <ModuleCard
      href="/community"
      icon={<Users className="size-5" strokeWidth={1.75} />}
      iconClass="text-[var(--info)]"
      iconBg="bg-[var(--info)]/14"
      code="COMMUNITY"
      title="Community"
      description="Neighborhoods & insights."
      metaRow={
        <div className="grid flex-1 grid-cols-3 gap-3">
          <MetaCell value={String(community.vibeCount)} label="Vibes" />
          <MetaCell value={`${community.avgTemp}°F`} label="Avg. high" />
          <MetaCell value={community.topNeighborhood} label="Top match" tone="ok" />
        </div>
      }
      ctaLabel="Open"
      footnote={<SourceTag id={community.source} />}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Checklist — data-driven                                              */
/* ------------------------------------------------------------------ */

function ChecklistCard({ checklist }: { checklist: OperationsGridProps["checklist"] }) {
  const { completePct } = checklist;

  return (
    <ModuleCard
      href="/checklist"
      icon={<CheckSquare className="size-5" strokeWidth={1.75} />}
      iconClass="text-[var(--warn)]"
      iconBg="bg-[var(--warn)]/14"
      code="CHECKLIST"
      title="Checklist"
      description="Tasks grouped by phase."
      rightSlot={
        <div className="flex flex-col items-center gap-1">
          <Donut percent={completePct} className="h-12 w-12" />
          <p className="label-cap text-[9px] text-muted-foreground">Complete</p>
        </div>
      }
      metaRow={
        <div className="grid flex-1 grid-cols-3 gap-3">
          <MetaCell
            value={`${checklist.completedTasks}/${checklist.totalTasks}`}
            label="Done"
            tone={completePct > 0 ? "ok" : "default"}
          />
          <MetaCell value={String(checklist.statutoryCount)} label="Statutory" tone="danger" />
          <MetaCell value={String(checklist.phaseCount)} label="Phases" tone="muted" />
        </div>
      }
      ctaLabel="Open"
    />
  );
}
