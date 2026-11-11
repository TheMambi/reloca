import type { Metadata } from "next";
import {
  Users,
  MessageCircle,
  Cloud,
  Quote,
  Home,
} from "lucide-react";
import { getCommunityInsights } from "@/lib/data";
import {
  getViewingRelocation,
  moveContextFor,
} from "@/lib/data/relocation-db";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { SourceTag } from "@/components/shared/source-tag";

export const metadata: Metadata = {
  title: "Community",
  description:
    "Community insights, neighborhood vibes, testimonials, and local rent data for your move.",
};

function usd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

const UNIT_LABELS: Record<string, string> = {
  studio: "Studio",
  "1br": "1 BR",
  "2br": "2 BR",
  "3br": "3 BR",
};

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const relocationId =
    typeof params.relocation === "string" ? params.relocation : undefined;
  const { viewing } = await getViewingRelocation(relocationId);
  const { originSlug, destinationSlug, originName, destinationName } =
    moveContextFor(viewing);

  const data = getCommunityInsights();
  const origin = data.find((c) => c.city === originSlug) ?? data[0];
  const dest = data.find((c) => c.city === destinationSlug) ?? data[0];

  return (
    <div className="flex min-h-[calc(100svh-3rem)] flex-col gap-6 p-6">
      {/* ─── Header ─── */}
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-[var(--radius-md)] bg-[var(--tint-community)]">
          <Users className="size-5 text-[var(--info)]" strokeWidth={1.75} />
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-[var(--tracking-headline)]">
            Community
          </h1>
          <p className="text-xs text-muted-foreground">
            Neighborhood vibes, rents, and local perspectives
          </p>
        </div>
      </div>

      {/* ─── City Tabs ─── */}
      <Tabs defaultValue={destinationSlug} className="flex-1">
        <TabsList className="w-fit">
          <TabsTrigger value={originSlug}>{originName}</TabsTrigger>
          <TabsTrigger value={destinationSlug}>{destinationName}</TabsTrigger>
          <TabsTrigger value="compare">Compare</TabsTrigger>
        </TabsList>

        <TabsContent value={originSlug} className="mt-4">
          <CityView city={origin} />
        </TabsContent>

        <TabsContent value={destinationSlug} className="mt-4">
          <CityView city={dest} />
        </TabsContent>

        <TabsContent value="compare" className="mt-4">
          <CompareView
            origin={origin}
            dest={dest}
            originName={originName}
            destName={destinationName}
          />
        </TabsContent>
      </Tabs>

      <SourceTag id={dest.source} />
    </div>
  );
}

/* ── Single-city view ── */

function CityView({
  city,
}: {
  city: { city: string; avgRent: { unit: string; median: number }[]; weatherSummary: string; vibeTags: string[]; testimonials: { author: string; role: string; neighborhood: string; quote: string }[] };
}) {
  return (
    <div className="flex flex-col gap-6">
      {/* Weather + Vibes */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-[var(--radius-lg)] border border-border bg-card p-6">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Cloud className="size-4" strokeWidth={1.75} />
            <span className="label-cap text-[10px]">WEATHER</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-foreground">
            {city.weatherSummary}
          </p>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-border bg-card p-6">
          <span className="label-cap text-[10px] text-muted-foreground">
            NEIGHBORHOOD VIBES
          </span>
          <div className="mt-3 flex flex-wrap gap-2">
            {city.vibeTags.map((tag) => (
              <Badge
                key={tag}
                variant="secondary"
                className="border-border/70 text-xs capitalize"
              >
                {tag.replace(/-/g, " ")}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      {/* Rent Grid */}
      <div className="rounded-[var(--radius-lg)] border border-border bg-card p-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Home className="size-4" strokeWidth={1.75} />
          <span className="label-cap text-[10px]">MEDIAN RENT</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {city.avgRent.map((r) => (
            <div
              key={r.unit}
              className="flex flex-col gap-1 rounded-[var(--radius-md)] border border-border/50 bg-background/30 p-3"
            >
              <span className="label-cap text-[9px] text-muted-foreground">
                {UNIT_LABELS[r.unit] ?? r.unit}
              </span>
              <span className="mono-num text-lg font-semibold text-foreground">
                {usd(r.median)}
              </span>
              <span className="text-[10px] text-muted-foreground">/month</span>
            </div>
          ))}
        </div>
      </div>

      {/* Testimonials */}
      <div className="rounded-[var(--radius-lg)] border border-border bg-card p-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <MessageCircle className="size-4" strokeWidth={1.75} />
          <span className="label-cap text-[10px]">LOCAL VOICES</span>
        </div>
        <div className="mt-4 space-y-4">
          {city.testimonials.map((t) => (
            <blockquote
              key={t.author}
              className="relative rounded-[var(--radius-md)] border border-border/50 bg-background/30 p-4"
            >
              <Quote className="absolute right-3 top-3 size-5 text-border" strokeWidth={1.5} />
              <p className="pr-8 text-sm italic leading-relaxed text-foreground/90">
                &ldquo;{t.quote}&rdquo;
              </p>
              <footer className="mt-3 flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-full bg-[var(--info)]/12 text-xs font-semibold text-[var(--info)]">
                  {t.author.charAt(0)}
                </span>
                <div>
                  <p className="text-xs font-medium text-foreground">{t.author}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {t.role} · {t.neighborhood}
                  </p>
                </div>
              </footer>
            </blockquote>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Compare view ── */

function CompareView({
  origin,
  dest,
  originName,
  destName,
}: {
  origin: { avgRent: { unit: string; median: number }[] };
  dest: { avgRent: { unit: string; median: number }[] };
  originName: string;
  destName: string;
}) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-card">
      <div className="grid grid-cols-[1fr_100px_100px_80px] items-center gap-2 border-b border-border px-4 py-3 text-[10px]">
        <span className="label-cap text-muted-foreground">Unit Type</span>
        <span className="label-cap text-right text-muted-foreground">{originName}</span>
        <span className="label-cap text-right text-muted-foreground">{destName}</span>
        <span className="label-cap text-right text-muted-foreground">Delta</span>
      </div>
      {origin.avgRent.map((oUnit, i) => {
        const dUnit = dest.avgRent[i];
        const pct = ((dUnit.median - oUnit.median) / oUnit.median) * 100;
        return (
          <div
            key={oUnit.unit}
            className="grid grid-cols-[1fr_100px_100px_80px] items-center gap-2 border-b border-border/50 px-4 py-3 last:border-0"
          >
            <span className="text-sm font-medium text-foreground">
              {UNIT_LABELS[oUnit.unit] ?? oUnit.unit}
            </span>
            <span className="mono-num text-right text-sm text-foreground">
              {usd(oUnit.median)}
            </span>
            <span className="mono-num text-right text-sm text-foreground">
              {usd(dUnit.median)}
            </span>
            <span
              className={`mono-num text-right text-sm font-medium ${pct > 0 ? "text-[var(--danger)]" : "text-[var(--ok)]"}`}
            >
              {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
