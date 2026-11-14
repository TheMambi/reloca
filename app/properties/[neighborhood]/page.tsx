import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ShieldAlert,
  ArrowLeft,
  Droplets,
  Flame,
  Waves,
  Activity,
  Thermometer,
  CloudRain,
  Sun,
  Scale,
  Clock,
} from "lucide-react";
import {
  getCrimeRecord,
  getClimateProfile,
  getProperties,
  cityName as resolveCityName,
} from "@/lib/data";
import { getActiveMoveContext } from "@/lib/data/relocation-db";
import { toSlug } from "@/lib/data/neighborhoods";
import { Badge } from "@/components/ui/badge";
import { SourceTagList } from "@/components/shared/source-tag";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ neighborhood: string }>;
}): Promise<Metadata> {
  const { neighborhood } = await params;
  const prop = findNeighborhood(neighborhood);
  if (!prop) notFound();
  return {
    title: `${prop.neighborhood} — Risk`,
    description: `Climate, crime, and environmental risk drill-down for the ${prop.neighborhood} neighborhood.`,
  };
}

// Only neighborhoods in the listings data have a page. The name shown comes
// from the data, never from the address the visitor typed. The middleware
// answers 404 for the rest; this check covers any address it does not see.
function findNeighborhood(segment: string) {
  return getProperties().find((p) => toSlug(p.neighborhood) === segment);
}

/* ── Helpers ── */

function riskTone(level: string): "ok" | "warn" | "danger" | "muted" {
  switch (level) {
    case "none": case "low": case "X": return "ok";
    case "moderate": case "B": return "warn";
    case "significant": case "high": case "A": case "AE": case "VE": return "danger";
    default: return "muted";
  }
}

function toneClass(tone: "ok" | "warn" | "danger" | "muted"): string {
  return {
    ok: "text-[var(--ok)]",
    warn: "text-[var(--warn)]",
    danger: "text-[var(--danger)]",
    muted: "text-muted-foreground",
  }[tone];
}

export default async function RiskPage({
  params,
}: {
  params: Promise<{ neighborhood: string }>;
}) {
  const { neighborhood } = await params;
  const prop = findNeighborhood(neighborhood);
  if (!prop) notFound();

  const moveCtx = await getActiveMoveContext();

  // The neighborhood's own city is the "current" side; the other side is the
  // active move's other endpoint (origin if this is the destination, and vice
  // versa) — so a Sacramento neighborhood compares against Denver, etc.
  const currentSlug = prop.city;
  const otherSlug =
    currentSlug === moveCtx.originSlug
      ? moveCtx.destinationSlug
      : moveCtx.originSlug;

  const cityName = resolveCityName(currentSlug);
  const otherCityName = resolveCityName(otherSlug);

  const crime = getCrimeRecord(currentSlug);
  const otherCrime = getCrimeRecord(otherSlug);
  const climate = getClimateProfile(currentSlug);
  const otherClimate = getClimateProfile(otherSlug);

  return (
    <div className="flex min-h-[calc(100svh-3rem)] flex-col gap-6 p-6">
      {/* ─── Back link ─── */}
      <Link
        href="/properties"
        className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" strokeWidth={1.75} />
        <span>Back to Properties</span>
      </Link>

      {/* ─── Header ─── */}
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-[var(--radius-md)] bg-[var(--danger)]/15">
          <ShieldAlert className="size-5 text-[var(--danger)]" strokeWidth={1.75} />
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-[var(--tracking-headline)]">
            {prop.neighborhood}
          </h1>
          <p className="text-xs text-muted-foreground">
            Risk drill-down · {cityName}. These figures cover the whole city,
            not this neighborhood alone.
          </p>
        </div>
      </div>

      {/* ─── Side-by-side summary ─── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SummaryCard
          city={cityName}
          isCurrent
          crime={crime.summary}
          climate={climate}
        />
        <SummaryCard
          city={otherCityName}
          isCurrent={false}
          crime={otherCrime.summary}
          climate={otherClimate}
        />
      </div>

      {/* ─── Crime Section ─── */}
      <section className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Scale className="size-4 text-[var(--warn)]" strokeWidth={1.75} />
          Crime Analysis
        </h2>

        {/* Headline numbers */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label="Violent"
            value={`${crime.summary.violentPer1k.toFixed(1)}/1k`}
            benchmark={`Natl: ${crime.benchmarkNational.violentPer1k}/1k`}
            tone={crime.summary.violentPer1k > crime.benchmarkNational.violentPer1k ? "danger" : "ok"}
          />
          <StatCard
            label="Property"
            value={`${crime.summary.propertyPer1k.toFixed(1)}/1k`}
            benchmark={`Natl: ${crime.benchmarkNational.propertyPer1k}/1k`}
            tone={crime.summary.propertyPer1k > crime.benchmarkNational.propertyPer1k ? "danger" : "ok"}
          />
          <StatCard
            label="Quality of Life"
            value={`${crime.summary.qualityOfLifePer1k.toFixed(1)}/1k`}
            benchmark={null}
            tone="muted"
          />
        </div>

        {/* Category breakdown */}
        <div className="rounded-[var(--radius-lg)] border border-border bg-card p-6">
          <span className="label-cap text-[10px] text-muted-foreground">
            CATEGORY BREAKDOWN
          </span>
          <div className="mt-3 space-y-2.5">
            {crime.byCategory.map((cat) => {
              const maxPer1k = Math.max(
                ...crime.byCategory.map((c) => c.per1k),
                0.1
              );
              const widthPct = (cat.per1k / maxPer1k) * 100;
              const catTone =
                cat.category === "violent"
                  ? "danger"
                  : cat.category === "property"
                  ? "warn"
                  : "muted";

              return (
                <div key={cat.subcategory} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-xs text-muted-foreground truncate">
                    {cat.subcategory}
                  </span>
                  <div className="relative h-3 flex-1 overflow-hidden rounded-[2px] bg-border/30">
                    <div
                      className={`absolute inset-y-0 left-0 rounded-[2px] ${catTone === "danger" ? "bg-[var(--danger)]" : catTone === "warn" ? "bg-[var(--warn)]" : "bg-muted-foreground"}`}
                      style={{ width: `${widthPct}%`, opacity: 0.7 }}
                    />
                  </div>
                  <span className="mono-num w-16 shrink-0 text-right text-xs text-foreground">
                    {cat.per1k.toFixed(2)}/1k
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Hour-of-day heatmap (OD-3: using inline SVG, no D3) */}
        <div className="rounded-[var(--radius-lg)] border border-border bg-card p-6">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" strokeWidth={1.75} />
            <span className="label-cap text-[10px] text-muted-foreground">
              INCIDENTS BY HOUR OF DAY
            </span>
          </div>
          <HourHeatmap buckets={crime.byHourOfDay} />
        </div>

        {/* 12-month trend */}
        <div className="rounded-[var(--radius-lg)] border border-border bg-card p-6">
          <span className="label-cap text-[10px] text-muted-foreground">
            12-MONTH TREND
          </span>
          <MonthlyTrend months={crime.byMonth} />
        </div>
      </section>

      {/* ─── Climate Section ─── */}
      <section className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Thermometer className="size-4 text-[var(--info)]" strokeWidth={1.75} />
          Climate &amp; Environmental Risk
        </h2>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <ClimateMetric
            icon={<Droplets className="size-4" strokeWidth={1.75} />}
            label="FEMA Flood"
            value={climate.flood.femaTier}
            sub={`${(climate.flood.annualChanceFlood * 100).toFixed(2)}% annual`}
            tone={riskTone(climate.flood.femaTier)}
          />
          <ClimateMetric
            icon={<Flame className="size-4" strokeWidth={1.75} />}
            label="Wildfire"
            value={`${climate.wildfire.score}/100`}
            sub={climate.wildfire.nearestActiveZoneKm !== null ? `${climate.wildfire.nearestActiveZoneKm} km` : "N/A"}
            tone={climate.wildfire.score > 60 ? "danger" : climate.wildfire.score > 30 ? "warn" : "ok"}
          />
          <ClimateMetric
            icon={<Waves className="size-4" strokeWidth={1.75} />}
            label="Sea Level Rise"
            value={climate.seaLevelRise.exposure}
            sub={climate.seaLevelRise.projection2050cm !== null ? `+${climate.seaLevelRise.projection2050cm}cm by 2050` : "Inland"}
            tone={riskTone(climate.seaLevelRise.exposure)}
          />
          <ClimateMetric
            icon={<Activity className="size-4" strokeWidth={1.75} />}
            label="Earthquake"
            value={climate.earthquake.riskLevel}
            sub={climate.earthquake.lastMajorEvent ?? "No major events"}
            tone={riskTone(climate.earthquake.riskLevel)}
          />
          <ClimateMetric
            icon={<Sun className="size-4" strokeWidth={1.75} />}
            label="Heat Days"
            value={`${climate.heatDaysPerYear}/yr`}
            sub={`>90°F days`}
            tone={climate.heatDaysPerYear > 50 ? "danger" : climate.heatDaysPerYear > 20 ? "warn" : "ok"}
          />
          <ClimateMetric
            icon={<CloudRain className="size-4" strokeWidth={1.75} />}
            label="Precipitation"
            value={`${climate.annualPrecipitationIn}″`}
            sub={`Annual`}
            tone="muted"
          />
          <ClimateMetric
            icon={<Thermometer className="size-4" strokeWidth={1.75} />}
            label="Temp Range"
            value={`${climate.avgLowF}°–${climate.avgHighF}°F`}
            sub={`Avg low / high`}
            tone="muted"
          />
          <ClimateMetric
            icon={<Droplets className="size-4" strokeWidth={1.75} />}
            label="Drought Index"
            value={climate.droughtIndex.toFixed(1)}
            sub={climate.droughtIndex < -1 ? "Drought conditions" : "Normal"}
            tone={climate.droughtIndex < -2 ? "danger" : climate.droughtIndex < -1 ? "warn" : "ok"}
          />
        </div>

        <SourceTagList ids={[climate.source, crime.source]} />
      </section>
    </div>
  );
}

/* ── Summary card ── */

function SummaryCard({
  city,
  isCurrent,
  crime,
  climate,
}: {
  city: string;
  isCurrent: boolean;
  crime: { violentPer1k: number; propertyPer1k: number; totalPer1k: number };
  climate: { flood: { femaTier: string }; earthquake: { riskLevel: string }; wildfire: { score: number } };
}) {
  return (
    <div className={`rounded-[var(--radius-lg)] border bg-card p-6 ${isCurrent ? "border-[var(--brand)]/40" : "border-border"}`}>
      <div className="flex items-center gap-2">
        <span className="label-cap text-[10px] text-muted-foreground">
          {isCurrent ? "CURRENT" : "COMPARED TO"}
        </span>
        <span className="text-sm font-semibold text-foreground">{city}</span>
        {isCurrent && (
          <Badge variant="secondary" className="ml-auto text-[9px]">
            TARGET
          </Badge>
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Total Crime" value={`${crime.totalPer1k.toFixed(1)}/1k`} />
        <MiniStat label="Violent" value={`${crime.violentPer1k.toFixed(1)}/1k`} />
        <MiniStat label="Flood" value={climate.flood.femaTier} />
        <MiniStat label="Earthquake" value={climate.earthquake.riskLevel} />
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label-cap text-[9px] text-muted-foreground">{label}</p>
      <p className="mono-num mt-1 text-sm font-medium capitalize text-foreground">{value}</p>
    </div>
  );
}

/* ── Stat Card ── */

function StatCard({
  label,
  value,
  benchmark,
  tone,
}: {
  label: string;
  value: string;
  benchmark: string | null;
  tone: "ok" | "warn" | "danger" | "muted";
}) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-card p-4">
      <span className="label-cap text-[9px] text-muted-foreground">{label}</span>
      <p className={`mono-num mt-2 text-xl font-semibold ${toneClass(tone)}`}>{value}</p>
      {benchmark && (
        <p className="mt-1 text-[10px] text-muted-foreground">{benchmark}</p>
      )}
    </div>
  );
}

/* ── Climate Metric ── */

function ClimateMetric({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: "ok" | "warn" | "danger" | "muted";
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <span className={`${toneClass(tone)}`}>{icon}</span>
        <span className="label-cap text-[9px] text-muted-foreground">{label}</span>
      </div>
      <p className={`mono-num text-lg font-semibold capitalize ${toneClass(tone)}`}>
        {value}
      </p>
      <p className="text-[10px] leading-relaxed text-muted-foreground">{sub}</p>
    </div>
  );
}

/* ── Hour Heatmap (inline SVG, OD-3 resolved) ── */

function HourHeatmap({ buckets }: { buckets: { hour: number; count: number }[] }) {
  const max = Math.max(...buckets.map((b) => b.count), 1);
  const cellSize = 28;
  const gap = 2;
  const w = buckets.length * (cellSize + gap);

  return (
    <div className="mt-3 overflow-x-auto">
      <svg
        viewBox={`0 0 ${w} ${cellSize + 18}`}
        width={w}
        height={cellSize + 18}
        aria-label="Crime incidents by hour of day"
        role="img"
      >
        {buckets.map((b, i) => {
          const intensity = b.count / max;
          const x = i * (cellSize + gap);
          return (
            <g key={b.hour}>
              <rect
                x={x}
                y={0}
                width={cellSize}
                height={cellSize}
                rx={3}
                fill={`oklch(${0.35 + intensity * 0.35} ${intensity * 0.18} 25)`}
                opacity={0.3 + intensity * 0.7}
              />
              <text
                x={x + cellSize / 2}
                y={cellSize / 2 + 1}
                textAnchor="middle"
                dominantBaseline="central"
                fontFamily="var(--font-mono)"
                fontSize="8"
                fill="var(--foreground)"
                opacity={0.8}
              >
                {b.count}
              </text>
              <text
                x={x + cellSize / 2}
                y={cellSize + 12}
                textAnchor="middle"
                fontFamily="var(--font-mono)"
                fontSize="7"
                fill="var(--muted-foreground)"
              >
                {b.hour.toString().padStart(2, "0")}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ── Monthly Trend (inline SVG) ── */

function MonthlyTrend({ months }: { months: { month: string; total: number }[] }) {
  const max = Math.max(...months.map((m) => m.total), 1);
  const barW = 32;
  const gap = 4;
  const h = 80;
  const w = months.length * (barW + gap);

  return (
    <div className="mt-3 overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h + 18}`} width={w} height={h + 18} role="img" aria-label="Monthly crime trend">
        {months.map((m, i) => {
          const barH = (m.total / max) * h;
          const x = i * (barW + gap);
          return (
            <g key={m.month}>
              <rect
                x={x}
                y={h - barH}
                width={barW}
                height={barH}
                rx={2}
                fill="var(--brand)"
                opacity={0.6}
              />
              <text
                x={x + barW / 2}
                y={h - barH - 4}
                textAnchor="middle"
                fontFamily="var(--font-mono)"
                fontSize="8"
                fill="var(--foreground)"
              >
                {m.total}
              </text>
              <text
                x={x + barW / 2}
                y={h + 12}
                textAnchor="middle"
                fontFamily="var(--font-mono)"
                fontSize="7"
                fill="var(--muted-foreground)"
              >
                {m.month.slice(5)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
