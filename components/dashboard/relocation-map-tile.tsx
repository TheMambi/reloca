"use client";

import { useEffect, useRef } from "react";
import { CARTO_DARK_SOURCE, maplibregl } from "@/lib/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, LineString } from "geojson";

export type MapPoint = {
  lat: number;
  lng: number;
  label: string;
};

const ROUTE_DRAW_MS = 1500;

const CARTO_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: { carto: CARTO_DARK_SOURCE },
  layers: [{ id: "carto-tiles", type: "raster", source: "carto" }],
};

function routeBounds(
  o: MapPoint,
  d: MapPoint,
): [[number, number], [number, number]] {
  return [
    [Math.min(o.lng, d.lng), Math.min(o.lat, d.lat)],
    [Math.max(o.lng, d.lng), Math.max(o.lat, d.lat)],
  ];
}

function lineFeature(
  a: MapPoint,
  b: { lat: number; lng: number },
): Feature<LineString> {
  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: [
        [a.lng, a.lat],
        [b.lng, b.lat],
      ],
    },
    properties: {},
  };
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// Dashboard tile: continental relocation arc from origin → destination with
// an animated dashed reveal. The candidate-property pins moved to /properties'
// dedicated map view (the spatial question — "where are these listings
// relative to each other and the coast?" — belongs there, not here).
//
// The map is created once and then *updated in place* when origin/destination
// change (e.g. the relocation switcher flips Long Beach → Sacramento). The
// reactive effect is keyed on the primitive coordinates, not the prop objects,
// so an unrelated parent re-render never tears the map down — and a real switch
// always moves the markers, refits the bounds, and redraws the arc.
export function RelocationMapTile({
  origin,
  destination,
}: {
  origin: MapPoint;
  destination: MapPoint;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const originMarkerRef = useRef<maplibregl.Marker | null>(null);
  const destMarkerRef = useRef<maplibregl.Marker | null>(null);
  const routeReadyRef = useRef(false);
  const rafRef = useRef(0);
  // Holds the latest "apply current points" closure so the async map-load
  // handler (created once at mount) always runs against the freshest coords.
  const applyRef = useRef<() => void>(() => {});

  // Reactive create-or-update effect, keyed on the primitive coordinates +
  // labels so it re-runs on a real switch but not on incidental re-renders.
  useEffect(() => {
    function applyPoints() {
      const map = mapRef.current;
      if (!map) return;

      originMarkerRef.current
        ?.setLngLat([origin.lng, origin.lat])
        .setPopup(new maplibregl.Popup({ offset: 16 }).setText(origin.label));
      destMarkerRef.current
        ?.setLngLat([destination.lng, destination.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 16 }).setText(destination.label),
        );

      map.fitBounds(routeBounds(origin, destination), {
        padding: 64,
        duration: 0,
      });

      const source = map.getSource("route") as
        | maplibregl.GeoJSONSource
        | undefined;
      if (!routeReadyRef.current || !source) return; // load handler will retry

      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      if (prefersReducedMotion()) {
        source.setData(lineFeature(origin, destination));
        return;
      }

      // Animate the second coordinate from origin → destination so the dashed
      // arc visibly draws itself (easeOutCubic — quick draw, gentle arrival).
      const startedAt = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - startedAt) / ROUTE_DRAW_MS);
        const eased = 1 - (1 - t) ** 3;
        const lng = origin.lng + (destination.lng - origin.lng) * eased;
        const lat = origin.lat + (destination.lat - origin.lat) * eased;
        source.setData(lineFeature(origin, { lat, lng }));
        if (t < 1) rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }
    applyRef.current = applyPoints;

    if (!mapRef.current && containerRef.current) {
      const map = new maplibregl.Map({
        container: containerRef.current,
        style: CARTO_STYLE,
        center: [origin.lng, origin.lat],
        zoom: 4,
      });
      mapRef.current = map;

      originMarkerRef.current = new maplibregl.Marker({ color: "#a78bfa" })
        .setLngLat([origin.lng, origin.lat])
        .setPopup(new maplibregl.Popup({ offset: 16 }).setText(origin.label))
        .addTo(map);
      destMarkerRef.current = new maplibregl.Marker({ color: "#fb923c" })
        .setLngLat([destination.lng, destination.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 16 }).setText(destination.label),
        )
        .addTo(map);

      map.on("load", () => {
        // Start the line at zero length (origin → origin) so the reveal draws.
        map.addSource("route", { type: "geojson", data: lineFeature(origin, origin) });
        map.addLayer({
          id: "route",
          type: "line",
          source: "route",
          paint: {
            "line-color": "#fb923c",
            "line-width": 2,
            "line-dasharray": [3, 2],
          },
        });
        routeReadyRef.current = true;
        applyRef.current(); // draw against the freshest coords
      });
    } else {
      applyPoints();
    }
    // Keyed on the primitive coords + labels on purpose: listing the `origin` /
    // `destination` objects would re-run (and replay the arc) on every
    // incidental parent re-render, since the RSC hands down fresh object
    // identities each time. applyPoints reads the latest values via closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    origin.lat,
    origin.lng,
    origin.label,
    destination.lat,
    destination.lng,
    destination.label,
  ]);

  // Tear the map down only on unmount — never on a coord change.
  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      mapRef.current?.remove();
      mapRef.current = null;
      routeReadyRef.current = false;
    };
  }, []);

  const ariaLabel = `Relocation map showing the route from ${origin.label} to ${destination.label}.`;

  return (
    <>
      <div
        ref={containerRef}
        role="img"
        aria-label={ariaLabel}
        className="h-72 w-full overflow-hidden rounded-md border border-border"
      />
      {/* Textual fallback for screen-reader users — MapLibre's canvas can't
          be navigated by AT, so we mirror the route as a real list. */}
      <ul className="sr-only">
        <li>Origin: {origin.label}.</li>
        <li>Destination: {destination.label}.</li>
      </ul>
    </>
  );
}
