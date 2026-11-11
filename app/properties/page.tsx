import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Heart } from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { getProperties } from "@/lib/data";
import { aggregateNeighborhoods } from "@/lib/data/neighborhoods";
import { getDestinations } from "@/lib/data/lease-db";
import {
  getSavedNeighborhoods,
  buildSavedIdMap,
} from "@/lib/data/saved-neighborhoods-db";
import { buildNeighborhoodCompareRows } from "@/lib/data/neighborhood-compare";
import {
  getRelocations,
  getActiveMoveContext,
} from "@/lib/data/relocation-db";
import { buildRelocationCompareColumns } from "@/lib/data/relocation-compare";
import { NeighborhoodGrid } from "@/components/properties/neighborhood-grid";
import { NeighborhoodMapLoader } from "@/components/properties/neighborhood-map-loader";
import { DestinationsCompareBlock } from "@/components/properties/destinations-compare-block";
import { SavedCompareBlock } from "@/components/properties/saved-compare-block";
import { RelocationsCompareBlock } from "@/components/properties/relocations-compare-block";

export const metadata: Metadata = {
  title: "Properties",
  description:
    "Compare destination neighborhoods side by side, and review the buildings you're considering for your move.",
};

export const dynamic = "force-dynamic";

const TABS = ["neighborhoods", "compare"] as const;
type TabId = (typeof TABS)[number];

type CompareView = "destinations" | "saved" | "relocations";

function normalizeTab(raw: string | undefined): TabId {
  return TABS.includes(raw as TabId) ? (raw as TabId) : "neighborhoods";
}

function normalizeCompareView(raw: string | undefined): CompareView {
  if (raw === "saved") return "saved";
  if (raw === "relocations") return "relocations";
  return "destinations";
}

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    saved?: string;
    compareView?: string;
  }>;
}) {
  const { tab, saved, compareView: compareViewParam } = await searchParams;
  const initialTab = normalizeTab(tab);
  const savedFilter = saved === "1";
  const compareView = normalizeCompareView(compareViewParam);

  // The /properties surface is bound to the ACTIVE move's destination (the
  // candidate buildings + saved neighborhoods are that move's; the relocation
  // compare below is the cross-relocation reference view).
  const moveCtx = await getActiveMoveContext();
  const destCityName = moveCtx.destinationName;

  const properties = getProperties();
  const summaries = aggregateNeighborhoods(properties, moveCtx.destinationSlug);

  const savedRows = await getSavedNeighborhoods();
  const savedIdMap = buildSavedIdMap(savedRows);

  // The destination-city neighborhoods (where you're moving TO) drive the map
  // view — the spatial question is "where do these candidate neighborhoods sit
  // relative to each other and the coast?" Per AD-027 the neighborhood is the
  // unit of truth across cards, save-state, the saved-compare matrix, and the
  // map.
  const destSummaries = summaries.filter((s) => s.city === destCityName);

  // The active lease destination gets a coral pin on top of
  // the listings layer so you can see "here's the building I'm signing, here's
  // how it sits among the alternates."
  const destinations = await getDestinations();
  const active = destinations.find((d) => d.is_active_target);
  const activeLatLng =
    active && active.lat !== null && active.lng !== null
      ? { lat: active.lat, lng: active.lng }
      : null;
  const activeLabel = active
    ? `${active.building_name}, ${active.city}`
    : null;

  // Why: the saved-compare view is the only consumer of crime + climate JSON
  // here; skip the reads when not on that view.
  const savedCompareView =
    compareView === "saved"
      ? buildNeighborhoodCompareRows(savedRows, properties)
      : null;

  // The relocation compare reduces each relocation to its destination-city
  // reference facts; only loaded when that view is active.
  const relocationColumns =
    compareView === "relocations"
      ? buildRelocationCompareColumns(await getRelocations())
      : null;

  const destinationsHref = "/properties?tab=compare";
  const savedHref = "/properties?tab=compare&compareView=saved";
  const relocationsHref = "/properties?tab=compare&compareView=relocations";

  return (
    <div className="flex min-h-[calc(100svh-3rem)] flex-col gap-6 p-6">
      <header className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-[var(--radius-md)] bg-[var(--tint-property)]">
          <Building2 className="size-5 text-[var(--brand)]" strokeWidth={1.75} />
        </span>
        <div>
          <p className="label-cap text-[10px] tracking-wider text-muted-foreground">
            DESTINATION · PROPERTIES
          </p>
          <h2 className="mt-0.5 text-lg font-semibold tracking-[var(--tracking-headline)]">
            Neighborhoods & buildings
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {destSummaries.length} neighborhoods in {destCityName}
          </p>
        </div>
      </header>

      <Tabs defaultValue={initialTab} className="gap-4">
        <TabsList>
          <TabsTrigger value="neighborhoods">Neighborhoods</TabsTrigger>
          <TabsTrigger value="compare">Compare</TabsTrigger>
        </TabsList>

        <TabsContent value="neighborhoods" className="mt-2 flex flex-col gap-6">
          <section
            aria-label={`${destCityName} listings map`}
            className="flex flex-col gap-3"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="label-cap text-xs text-muted-foreground">
                {destCityName} map
              </h3>
              <span className="text-[10px] text-muted-foreground">
                {destSummaries.length} neighborhoods · click for details
              </span>
            </div>
            <NeighborhoodMapLoader
              summaries={destSummaries}
              savedIdMap={savedIdMap}
              activeLatLng={activeLatLng}
              activeLabel={activeLabel}
            />
          </section>

          {savedRows.length > 0 && (
            <div className="flex items-center gap-2">
              <Link
                href={
                  savedFilter
                    ? "/properties?tab=neighborhoods"
                    : "/properties?tab=neighborhoods&saved=1"
                }
                aria-pressed={savedFilter}
                className={
                  savedFilter
                    ? "inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--brand-secondary)] bg-card px-2.5 py-1 text-[11px] font-medium text-[var(--brand-secondary)] transition-colors"
                    : "inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                }
              >
                <Heart
                  className="size-3"
                  fill={savedFilter ? "currentColor" : "none"}
                  strokeWidth={1.75}
                />
                Saved ({savedRows.length})
              </Link>
            </div>
          )}

          <NeighborhoodGrid
            summaries={destSummaries}
            savedIdMap={savedIdMap}
            savedFilter={savedFilter}
          />
        </TabsContent>

        <TabsContent value="compare" className="mt-2 flex flex-col gap-4">
          <div
            role="tablist"
            aria-label="Compare view"
            className="flex flex-wrap items-center gap-2"
          >
            <Link
              href={destinationsHref}
              role="tab"
              aria-selected={compareView === "destinations"}
              className={
                compareView === "destinations"
                  ? "inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--brand-secondary)] bg-card px-2.5 py-1 text-[11px] font-medium text-[var(--brand-secondary)] transition-colors"
                  : "inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              }
            >
              Property destinations
            </Link>
            <Link
              href={savedHref}
              role="tab"
              aria-selected={compareView === "saved"}
              className={
                compareView === "saved"
                  ? "inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--brand-secondary)] bg-card px-2.5 py-1 text-[11px] font-medium text-[var(--brand-secondary)] transition-colors"
                  : "inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              }
            >
              Saved neighborhoods ({savedRows.length})
            </Link>
            <Link
              href={relocationsHref}
              role="tab"
              aria-selected={compareView === "relocations"}
              className={
                compareView === "relocations"
                  ? "inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--brand-secondary)] bg-card px-2.5 py-1 text-[11px] font-medium text-[var(--brand-secondary)] transition-colors"
                  : "inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
              }
            >
              Relocations
            </Link>
          </div>

          {compareView === "saved" ? (
            <SavedCompareBlock
              view={savedCompareView}
              savedCount={savedRows.length}
            />
          ) : compareView === "relocations" ? (
            <RelocationsCompareBlock columns={relocationColumns ?? []} />
          ) : (
            <DestinationsCompareBlock destinations={destinations} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
