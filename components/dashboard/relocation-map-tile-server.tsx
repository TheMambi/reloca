import { Map as MapIcon } from "lucide-react";
import { ModuleCard, MetaCell } from "./operations-grid";
import { RelocationMapTileLoader } from "./relocation-map-tile-loader";
import { getCity } from "@/lib/data/cities";
import type { MoveContext } from "@/lib/data/relocation-db";
import { haversineMiles } from "@/lib/lease/distance";
import {
  countdownCell,
  countdownTone,
  daysUntilIso,
  todayUtcIso,
} from "@/lib/dates";

const milesFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function RelocationMapTileServer({ context }: { context: MoveContext }) {
  // No href / ctaLabel: the map is fully interactive in-tile per AD-022,
  // so the ModuleCard suppresses its trailing "Open" chip. There's no
  // detail route — pan/zoom + popups happen here.
  const baseProps = {
    icon: <MapIcon className="size-5" strokeWidth={1.75} />,
    iconClass: "text-[var(--brand-secondary)]",
    iconBg: "bg-[var(--brand-secondary)]/14",
    code: "RELOCATION MAP",
    title: "Relocation map",
    description: "How far, how soon, how many.",
  };

  // Reference-driven: the continental tile (AD-026) plots the viewing
  // relocation's two city centroids from the registry — so it recomputes when
  // the switcher changes the origin/destination, no lease/building coords
  // needed. (The metro listings map with building pins lives on /properties.)
  const originCity = getCity(context.originSlug);
  const destinationCity = getCity(context.destinationSlug);

  if (!originCity || !destinationCity) {
    return (
      <ModuleCard
        {...baseProps}
        metaRow={
          <p className="text-xs italic text-muted-foreground">
            Map appears once origin and destination are set
          </p>
        }
      />
    );
  }

  const origin = {
    lat: originCity.lat,
    lng: originCity.lng,
    label: context.originName,
  };
  const destination = {
    lat: destinationCity.lat,
    lng: destinationCity.lng,
    label: context.destinationName,
  };

  // Earn the tile: surface metrics that aren't visible on the map's labels.
  // Distance + countdown turn "Denver → Long Beach" (a fact you already
  // knew) into "1,346 mi, T-66" — the question the cockpit should answer.
  const distanceMi = haversineMiles(
    { lat: origin.lat, lng: origin.lng },
    { lat: destination.lat, lng: destination.lng },
  );
  // Shared countdown vocabulary (lib/dates): "T-12" pre-move, "3d ago" after —
  // and the destination cell flips from "Heading to" to "Now home" on arrival.
  const days = daysUntilIso(context.moveDate, todayUtcIso());
  const arrived = days !== null && days < 0;

  return (
    <ModuleCard
      {...baseProps}
      decoration={
        <div className="mt-4">
          <RelocationMapTileLoader
            origin={origin}
            destination={destination}
          />
        </div>
      }
      metaRow={
        <div className="grid flex-1 grid-cols-3 gap-3">
          <MetaCell
            value={`${milesFmt.format(distanceMi)} mi`}
            label="Distance"
          />
          <MetaCell
            value={countdownCell(days)}
            label={arrived ? "Moved" : "Move day"}
            tone={countdownTone(days)}
          />
          <MetaCell
            value={destination.label.split(",")[0]}
            label={arrived ? "Now home" : "Heading to"}
            tone="ok"
          />
        </div>
      }
    />
  );
}
