import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { NeighborhoodSummary } from "@/lib/data/neighborhoods";
import { SaveNeighborhoodButton } from "./save-neighborhood-button";

function usd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function bedLabel(min: number, max: number): string {
  if (min === 0 && max === 0) return "Studio";
  if (min === max) return `${min} bed`;
  if (min === 0) return `Studio–${max} bed`;
  return `${min}–${max} bed`;
}

interface NeighborhoodGridProps {
  summaries: NeighborhoodSummary[];
  savedIdMap: Map<string, string>;
  savedFilter?: boolean;
}

export function NeighborhoodGrid({
  summaries,
  savedIdMap,
  savedFilter = false,
}: NeighborhoodGridProps) {
  const visible = savedFilter
    ? summaries.filter((s) => savedIdMap.has(`${s.city}::${s.name}`))
    : summaries;

  if (savedFilter && visible.length === 0) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <p className="rounded-[var(--radius-lg)] border border-border bg-card p-4 text-xs text-muted-foreground sm:col-span-2 xl:col-span-3">
          No saved neighborhoods yet — heart-save one from the full list above.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {visible.map((s) => (
        <NeighborhoodCard
          key={`${s.city}-${s.slug}`}
          summary={s}
          savedId={savedIdMap.get(`${s.city}::${s.name}`) ?? null}
        />
      ))}
    </div>
  );
}

function NeighborhoodCard({
  summary,
  savedId,
}: {
  summary: NeighborhoodSummary;
  savedId: string | null;
}) {
  const cityCode = summary.cityCode;
  const hasRentals = summary.priceLow > 0;
  const buyOnly = !hasRentals;

  return (
    <div className="relative">
      <Link
        href={`/properties/${summary.slug}`}
        className="group flex flex-col rounded-[var(--radius-lg)] border border-border bg-card transition-colors hover:bg-card/80"
      >
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-3 pr-9">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {summary.name}
              </p>
              <div className="mt-0.5 flex items-center gap-2">
                <p className="mono-num text-[10px] tracking-wider text-muted-foreground">
                  {cityCode}
                </p>
                {summary.hasBuyListing && (
                  <Badge
                    variant="secondary"
                    className="border-0 bg-[var(--brand-secondary)]/14 text-[10px] font-semibold uppercase text-[var(--brand-secondary)]"
                  >
                    Buy
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 divide-x divide-border/60 border-y border-border/60">
            <div className="px-3 py-2">
              <p className="label-cap text-[9px] text-muted-foreground">
                Listings
              </p>
              <p className="mono-num mt-1 text-sm font-medium text-foreground">
                {summary.listingCount}
              </p>
            </div>
            <div className="px-3 py-2">
              <p className="label-cap text-[9px] text-muted-foreground">
                Rent range
              </p>
              <p className="mono-num mt-1 text-sm font-medium text-foreground">
                {buyOnly
                  ? "—"
                  : summary.priceLow === summary.priceHigh
                    ? `${usd(summary.priceLow)}/mo`
                    : `${usd(summary.priceLow)}–${usd(summary.priceHigh)}/mo`}
              </p>
            </div>
            <div className="px-3 py-2">
              <p className="label-cap text-[9px] text-muted-foreground">Beds</p>
              <p className="mono-num mt-1 text-sm font-medium text-foreground">
                {bedLabel(summary.bedRange.min, summary.bedRange.max)}
              </p>
            </div>
          </div>

          {summary.avgSeaProximityKm > 0 && (
            <p className="text-[11px] text-muted-foreground">
              <span className="mono-num text-foreground">
                {summary.avgSeaProximityKm.toFixed(1)}
              </span>{" "}
              km to coast
            </p>
          )}
        </div>
      </Link>
      <div className="absolute right-3 top-3">
        <SaveNeighborhoodButton
          city={summary.city}
          neighborhood={summary.name}
          savedId={savedId}
        />
      </div>
    </div>
  );
}
