import type { Metadata } from "next";
import { DollarSign, ArrowLeftRight, Info, Car, Train, Bike, Footprints } from "lucide-react";
import { getCostOfLiving, costValueFor } from "@/lib/data";
import { getActiveLease } from "@/lib/data/lease-db";
import {
  getViewingRelocation,
  moveContextFor,
} from "@/lib/data/relocation-db";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SourceTagList } from "@/components/shared/source-tag";

export const metadata: Metadata = {
  title: "Cost & Commute",
  description:
    "Side-by-side cost-of-living comparison across 8 spending categories for your move.",
};

/** Format a dollar amount using Intl (OD-1 resolved: no library). */
function usd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function pctDelta(denver: number, lb: number): { text: string; tone: "ok" | "danger" | "muted" } {
  if (denver === 0 && lb === 0) return { text: "—", tone: "muted" };
  if (denver === 0) return { text: "+∞", tone: "danger" };
  const pct = ((lb - denver) / denver) * 100;
  const sign = pct >= 0 ? "+" : "";
  const tone = pct > 0 ? "danger" : pct < 0 ? "ok" : "muted";
  return { text: `${sign}${pct.toFixed(1)}%`, tone };
}

const CATEGORY_LABELS: Record<string, string> = {
  housing: "Housing",
  utilities: "Utilities",
  groceries: "Groceries",
  transport: "Transport",
  healthcare: "Healthcare",
  taxes: "Taxes",
  childcare: "Childcare",
  entertainment: "Entertainment",
};

const MODE_ICONS: Record<string, React.ReactNode> = {
  car: <Car className="size-4" strokeWidth={1.75} />,
  transit: <Train className="size-4" strokeWidth={1.75} />,
  bike: <Bike className="size-4" strokeWidth={1.75} />,
  walk: <Footprints className="size-4" strokeWidth={1.75} />,
};

export default async function CostOfLivingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const relocationId =
    typeof params.relocation === "string" ? params.relocation : undefined;
  const [{ viewing }, lease] = await Promise.all([
    getViewingRelocation(relocationId),
    getActiveLease(),
  ]);
  const {
    originSlug,
    destinationSlug: destSlug,
    originName,
    destinationName: destName,
    originCode,
    destinationCode: destCode,
  } = moveContextFor(viewing);

  const data = getCostOfLiving();
  const showM2mPremium = lease?.decision === "m2m";

  const originTotal = data.categories.reduce((s, c) => s + costValueFor(c, originSlug), 0);
  const destTotal = data.categories.reduce((s, c) => s + costValueFor(c, destSlug), 0);
  const totalDelta = pctDelta(originTotal, destTotal);
  const costSources = [
    ...new Set(
      data.categories
        .map((c) => c.source)
        .filter((s): s is string => Boolean(s)),
    ),
  ];

  return (
    <div className="flex min-h-[calc(100svh-3rem)] flex-col gap-6 p-6">
      {/* ─── Header ─── */}
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-[var(--radius-md)] bg-[var(--tint-cost)]">
          <DollarSign className="size-5 text-[var(--ok)]" strokeWidth={1.75} />
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-[var(--tracking-headline)]">
            Cost &amp; Commute
          </h1>
          <p className="text-xs text-muted-foreground">
            Monthly spend comparison · data as of {data.asOf}
          </p>
        </div>
      </div>

      {/* ─── Route + Summary ─── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="mono-num text-foreground">{originCode}</span>
          <ArrowLeftRight className="size-3.5 text-[var(--brand-secondary)]" />
          <span className="mono-num text-foreground">{destCode}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="label-cap text-[10px]">{originName}</span>
          <span className="mono-num text-sm font-medium text-foreground">{usd(originTotal)}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="label-cap text-[10px]">{destName}</span>
          <span className="mono-num text-sm font-medium text-foreground">{usd(destTotal)}</span>
        </span>
        <span className={`mono-num text-sm font-semibold ${totalDelta.tone === "ok" ? "text-[var(--ok)]" : totalDelta.tone === "danger" ? "text-[var(--danger)]" : "text-muted-foreground"}`}>
          {totalDelta.text}
        </span>
      </div>

      {/* ─── Tabs ─── */}
      <Tabs defaultValue="categories" className="flex-1">
        <TabsList className="w-fit">
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="commute">Commute</TabsTrigger>
        </TabsList>

        {/* ─── Categories Tab ─── */}
        <TabsContent value="categories" className="mt-4">
          <div className="rounded-[var(--radius-lg)] border border-border bg-card">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_120px_120px_80px] items-center gap-2 border-b border-border px-4 py-3 text-[10px] sm:grid-cols-[1fr_140px_140px_100px_1fr]">
              <span className="label-cap text-muted-foreground">Category</span>
              <span className="label-cap text-right text-muted-foreground">{originName}</span>
              <span className="label-cap text-right text-muted-foreground">{destName}</span>
              <span className="label-cap text-right text-muted-foreground">Delta</span>
              <span className="label-cap hidden text-muted-foreground sm:block">Bar</span>
            </div>

            {/* Rows */}
            {data.categories.map((cat) => {
              const originVal = costValueFor(cat, originSlug);
              const destVal = costValueFor(cat, destSlug);
              const delta = pctDelta(originVal, destVal);
              const maxVal = Math.max(originVal, destVal) || 1;
              const denPct = (originVal / maxVal) * 100;
              const lbPct = (destVal / maxVal) * 100;

              return (
                <div key={cat.category}>
                <div
                  className="grid grid-cols-[1fr_120px_120px_80px] items-center gap-2 border-b border-border/50 px-4 py-3 transition-colors last:border-0 hover:bg-accent/30 sm:grid-cols-[1fr_140px_140px_100px_1fr]"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">
                      {CATEGORY_LABELS[cat.category] ?? cat.category}
                    </span>
                    {cat.notes && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label={`More about ${CATEGORY_LABELS[cat.category] ?? cat.category}`}
                            className="grid size-6 place-items-center rounded-[var(--radius-sm)] text-muted-foreground hover:bg-accent hover:text-foreground"
                          >
                            <Info className="size-3" strokeWidth={1.75} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="max-w-xs text-xs">
                          {cat.notes}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                  <span className="mono-num text-right text-sm text-foreground">
                    {usd(originVal)}
                  </span>
                  <span className="mono-num text-right text-sm text-foreground">
                    {usd(destVal)}
                  </span>
                  <span
                    className={`mono-num text-right text-sm font-medium ${delta.tone === "ok" ? "text-[var(--ok)]" : delta.tone === "danger" ? "text-[var(--danger)]" : "text-muted-foreground"}`}
                  >
                    {delta.text}
                  </span>
                  {/* Comparison bar */}
                  <div className="hidden items-center gap-1 sm:flex">
                    <div className="relative h-3 flex-1 overflow-hidden rounded-[2px] bg-border/40">
                      <div
                        className="absolute inset-y-0 left-0 rounded-[2px] bg-[var(--brand)]"
                        style={{ width: `${denPct}%`, opacity: 0.7 }}
                      />
                      <div
                        className="absolute inset-y-0 left-0 rounded-[2px] bg-[var(--brand-secondary)]"
                        style={{ width: `${lbPct}%`, opacity: 0.5 }}
                      />
                    </div>
                  </div>
                </div>
                {/* Month-to-month surcharge sub-row — renders only when the user has chosen month-to-month */}
                {cat.category === "housing" && showM2mPremium && lease && (
                  <div className="grid grid-cols-[1fr_120px_120px_80px] items-center gap-2 border-b border-border/50 bg-[var(--warn)]/5 px-4 py-2 sm:grid-cols-[1fr_140px_140px_100px_1fr]">
                    <div className="flex items-center gap-2 pl-4">
                      <span className="label-cap text-[10px] text-muted-foreground">
                        Housing (month-to-month surcharge)
                      </span>
                    </div>
                    <span
                      className="mono-num text-right text-sm font-medium text-[var(--warn)]"
                      title="Added because you chose month-to-month on the Lease page."
                    >
                      {`+${usd(lease.m2m_premium)}`}/mo
                    </span>
                    <span className="mono-num text-right text-sm text-muted-foreground">—</span>
                    <span className="mono-num text-right text-sm text-muted-foreground">—</span>
                    <span className="hidden text-[10px] text-muted-foreground sm:block">
                      Per your lease renewal letter
                    </span>
                  </div>
                )}
                </div>
              );
            })}

            {/* Totals row */}
            <div className="grid grid-cols-[1fr_120px_120px_80px] items-center gap-2 border-t border-border bg-accent/20 px-4 py-3 sm:grid-cols-[1fr_140px_140px_100px_1fr]">
              <span className="text-sm font-semibold text-foreground">Total Monthly</span>
              <span className="mono-num text-right text-sm font-semibold text-foreground">
                {usd(originTotal)}
              </span>
              <span className="mono-num text-right text-sm font-semibold text-foreground">
                {usd(destTotal)}
              </span>
              <span
                className={`mono-num text-right text-sm font-bold ${totalDelta.tone === "ok" ? "text-[var(--ok)]" : totalDelta.tone === "danger" ? "text-[var(--danger)]" : "text-muted-foreground"}`}
              >
                {totalDelta.text}
              </span>
              <span className="hidden sm:block" />
            </div>
          </div>
        </TabsContent>

        {/* ─── Commute Tab ─── */}
        <TabsContent value="commute" className="mt-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {[
              { slug: originSlug, code: originCode, name: originName },
              { slug: destSlug, code: destCode, name: destName },
            ].map(({ slug, code, name }) => {
              const cityData = data.commute.filter((c) => c.city === slug);
              return (
                <div
                  key={slug}
                  className="rounded-[var(--radius-lg)] border border-border bg-card p-6"
                >
                  <div className="flex items-center gap-2">
                    <span className="label-cap text-[10px] text-muted-foreground">
                      {code}
                    </span>
                    <span className="text-sm font-semibold text-foreground">{name}</span>
                  </div>

                  <div className="mt-4 space-y-3">
                    {cityData.map((c) => (
                      <div
                        key={c.mode}
                        className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border/50 bg-background/30 px-3 py-2.5"
                      >
                        <span className="text-muted-foreground">{MODE_ICONS[c.mode]}</span>
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-medium capitalize text-foreground">
                            {c.mode}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="mono-num text-sm font-medium text-foreground">
                            {c.avgMinutesOneWay} min
                          </p>
                          <p className="mono-num text-[10px] text-muted-foreground">
                            {usd(c.monthlyCost)}/mo
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>

      <SourceTagList ids={costSources} />
    </div>
  );
}
