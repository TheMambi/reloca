"use client";

import dynamic from "next/dynamic";
import type { NeighborhoodSummary } from "@/lib/data/neighborhoods";

// MapLibre is heavy (~200 KB gzipped) — keep it out of /properties' initial
// paint via dynamic import. Lives in a client island because Next 15
// forbids `ssr: false` inside Server Components.
const NeighborhoodMap = dynamic(
  () => import("./neighborhood-map").then((m) => m.NeighborhoodMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-80 w-full animate-pulse rounded-[var(--radius-lg)] border border-border bg-card" />
    ),
  },
);

interface NeighborhoodMapLoaderProps {
  summaries: NeighborhoodSummary[];
  savedIdMap: Map<string, string>;
  activeLatLng: { lat: number; lng: number } | null;
  activeLabel: string | null;
  fallbackCenter: { lat: number; lng: number };
}

export function NeighborhoodMapLoader(props: NeighborhoodMapLoaderProps) {
  return <NeighborhoodMap {...props} />;
}
