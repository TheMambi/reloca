"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { MapPoint } from "./relocation-map-tile";

// The skeleton matches the tile's resting height so the grid doesn't shift
// when the map arrives.
function MapSkeleton({ ref }: { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      className="h-72 w-full animate-pulse rounded-md border border-border bg-card"
    />
  );
}

// MapLibre is ~300 KB gzipped plus a worker file — keep it out of the
// dashboard's initial paint. Per AD-021. Lives in a client island because
// Next 15 forbids `ssr: false` inside Server Components.
const RelocationMapTile = dynamic(
  () => import("./relocation-map-tile").then((m) => m.RelocationMapTile),
  { ssr: false, loading: () => <MapSkeleton /> },
);

export function RelocationMapTileLoader({
  origin,
  destination,
}: {
  origin: MapPoint;
  destination: MapPoint;
}) {
  // The tile sits below the fold. Nothing of the map is fetched until it is
  // within a screen's height of the viewport, so a visit that never scrolls
  // down never pays for it.
  const placeholder = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = placeholder.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: "100% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!near) return <MapSkeleton ref={placeholder} />;
  return <RelocationMapTile origin={origin} destination={destination} />;
}
