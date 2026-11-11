"use client";

import dynamic from "next/dynamic";
import type { MapPoint } from "./relocation-map-tile";

// MapLibre is ~200 KB gzipped — keep it out of the dashboard's initial paint.
// Per AD-021. Lives in a client island because Next 15 forbids `ssr: false`
// inside Server Components. The skeleton matches the tile's resting height so
// the grid doesn't shift when the chunk arrives.
const RelocationMapTile = dynamic(
  () => import("./relocation-map-tile").then((m) => m.RelocationMapTile),
  {
    ssr: false,
    loading: () => (
      <div className="h-72 w-full animate-pulse rounded-md border border-border bg-card" />
    ),
  },
);

export function RelocationMapTileLoader({
  origin,
  destination,
}: {
  origin: MapPoint;
  destination: MapPoint;
}) {
  return <RelocationMapTile origin={origin} destination={destination} />;
}
