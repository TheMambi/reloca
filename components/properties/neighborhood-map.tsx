"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { CARTO_DARK_SOURCE, maplibregl } from "@/lib/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import type { NeighborhoodSummary } from "@/lib/data/neighborhoods";
import { SaveNeighborhoodButton } from "./save-neighborhood-button";

const fmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function bedLabel(min: number, max: number): string {
  if (min === 0 && max === 0) return "Studio";
  if (min === max) return `${min} bed`;
  if (min === 0) return `Studio–${max} bed`;
  return `${min}–${max} bed`;
}

function rentLabel(s: NeighborhoodSummary): string {
  if (s.priceLow === 0) return "—";
  if (s.priceLow === s.priceHigh) return `${fmt.format(s.priceLow)}/mo`;
  return `${fmt.format(s.priceLow)}–${fmt.format(s.priceHigh)}/mo`;
}

function seaLabel(km: number): string {
  if (km <= 0) return "inland";
  return `${km.toFixed(1)} km from coast`;
}

function key(s: NeighborhoodSummary): string {
  return `${s.city}::${s.name}`;
}

interface NeighborhoodMapProps {
  summaries: NeighborhoodSummary[];
  savedIdMap: Map<string, string>;
  activeLatLng: { lat: number; lng: number } | null;
  activeLabel: string | null;
  /** Where the map opens when there is nothing to pin: the destination city. */
  fallbackCenter: { lat: number; lng: number };
}

// Destination-zoomed neighborhood map. One marker per neighborhood centroid;
// click reveals a popup with name + save-heart + headline metrics + view link.
// The active destination (if any) gets a coral pin laid on top — different
// concept (a building being signed for) so it stays a separate visual layer.
export function NeighborhoodMap({
  summaries,
  savedIdMap,
  activeLatLng,
  activeLabel,
  fallbackCenter,
}: NeighborhoodMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  // Why: popup containers are owned by maplibre (it inserts/removes them
  // from the DOM as popups open and close); React mounts INTO them via
  // portal. Keep a stable ref keyed by neighborhood so re-renders find
  // the same container the marker is bound to.
  const popupContainersRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [openKey, setOpenKey] = useState<string | null>(null);

  // Every server refresh hands this component new arrays and objects, even
  // when nothing on the map changed (saving a neighborhood does exactly that).
  // The map is built from this string instead, so it is rebuilt only when a
  // pin, the active destination or the fallback really differs, and an open
  // popup, the zoom and the position survive a save.
  const mapKey = JSON.stringify({
    pins: summaries.map((s) => ({ k: key(s), lng: s.centroid.lng, lat: s.centroid.lat })),
    active: activeLatLng && activeLabel ? { ...activeLatLng, label: activeLabel } : null,
    activePoint: activeLatLng,
    fallback: [fallbackCenter.lng, fallbackCenter.lat],
  });

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const { pins, active, activePoint, fallback } = JSON.parse(mapKey) as {
      pins: { k: string; lng: number; lat: number }[];
      active: { lat: number; lng: number; label: string } | null;
      activePoint: { lat: number; lng: number } | null;
      fallback: [number, number];
    };

    // Why: capture the ref's current Map at effect-start so cleanup uses the
    // same object the setup populated -- React eslint warns when cleanup
    // dereferences ref.current directly because the ref can be reassigned
    // before the cleanup runs (esp. across StrictMode double-invokes in dev).
    const popupContainers = popupContainersRef.current;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: { carto: CARTO_DARK_SOURCE },
        layers: [{ id: "carto-tiles", type: "raster", source: "carto" }],
      },
      center: fallback,
      zoom: 11,
    });
    mapRef.current = map;

    // Fit bounds across all neighborhood centroids + the active destination
    // if present. Centroid math already lives in `aggregateNeighborhoods`.
    const allPoints: [number, number][] = pins.map((p) => [p.lng, p.lat]);
    if (activePoint) {
      allPoints.push([activePoint.lng, activePoint.lat]);
    }
    if (allPoints.length >= 2) {
      const lngs = allPoints.map((p) => p[0]);
      const lats = allPoints.map((p) => p[1]);
      map.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: 56, duration: 0, maxZoom: 13 },
      );
    } else if (allPoints.length === 1) {
      map.setCenter(allPoints[0]);
      map.setZoom(13);
    }

    // Active destination — coral pin, sits on top. Its popup is plain text
    // (label only); a building isn't a neighborhood, so no save-heart.
    if (active) {
      // Marker pins are inline SVG in the DOM, so CSS variables resolve —
      // keeps pin colors on the design tokens (AD-004; no off-token hex).
      new maplibregl.Marker({ color: "var(--brand-secondary)" })
        .setLngLat([active.lng, active.lat])
        .setPopup(new maplibregl.Popup({ offset: 16 }).setText(active.label))
        .addTo(map);
    }

    // Neighborhood markers — neutral pins. Each gets a fresh container we
    // own; maplibre slots it into its popup chrome and React portals into
    // it. Save-state lives in the popup heart, not the pin color.
    pins.forEach(({ k, lng, lat }) => {
      const container = document.createElement("div");
      popupContainers.set(k, container);

      const popup = new maplibregl.Popup({
        offset: 16,
        closeButton: true,
        closeOnClick: true,
      }).setDOMContent(container);

      popup.on("open", () => setOpenKey(k));
      popup.on("close", () => {
        setOpenKey((current) => (current === k ? null : current));
      });

      new maplibregl.Marker({ color: "var(--muted-foreground)" })
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(map);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      popupContainers.clear();
      setOpenKey(null);
    };
  }, [mapKey]);

  const ariaLabel = activeLabel
    ? `Map of ${summaries.length} neighborhoods around ${activeLabel}.`
    : `Map of ${summaries.length} neighborhoods.`;

  // The portal target only exists while maplibre has the popup open. Rendering
  // the portal contingent on `openKey` keeps React's tree honest.
  const openSummary = openKey
    ? (summaries.find((s) => key(s) === openKey) ?? null)
    : null;
  const openContainer = openKey
    ? (popupContainersRef.current.get(openKey) ?? null)
    : null;

  return (
    <>
      <div
        ref={containerRef}
        role="img"
        aria-label={ariaLabel}
        className="h-80 w-full overflow-hidden rounded-[var(--radius-lg)] border border-border"
      />
      {openSummary && openContainer
        ? createPortal(
            <NeighborhoodPopup
              summary={openSummary}
              savedId={savedIdMap.get(key(openSummary)) ?? null}
            />,
            openContainer,
          )
        : null}
      {/* sr-only fallback so screen-reader users get the same neighborhood
          vocabulary the cards use, since the MapLibre canvas is opaque to AT. */}
      <ul className="sr-only">
        {activeLabel && <li>Active destination: {activeLabel}.</li>}
        {summaries.map((s) => (
          <li key={key(s)}>
            {s.name} — {s.listingCount}{" "}
            {s.listingCount === 1 ? "listing" : "listings"}, {rentLabel(s)},{" "}
            {bedLabel(s.bedRange.min, s.bedRange.max)}, {seaLabel(s.avgSeaProximityKm)}.
          </li>
        ))}
      </ul>
    </>
  );
}

function NeighborhoodPopup({
  summary,
  savedId,
}: {
  summary: NeighborhoodSummary;
  savedId: string | null;
}) {
  const cityCode = summary.cityCode;

  return (
    <div className="flex min-w-[220px] flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-foreground">
            {summary.name}
          </span>
          <span className="mono-num text-[10px] tracking-wider text-muted-foreground">
            {cityCode}
          </span>
        </div>
        <SaveNeighborhoodButton
          city={summary.city}
          neighborhood={summary.name}
          savedId={savedId}
        />
      </div>

      <div className="flex flex-col gap-1 border-t border-border pt-2 text-[11px] text-muted-foreground">
        <div className="flex items-baseline justify-between gap-3">
          <span>Listings</span>
          <span className="mono-num text-foreground">
            {summary.listingCount}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span>Rent range</span>
          <span className="mono-num text-foreground">{rentLabel(summary)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span>Beds</span>
          <span className="text-foreground">
            {bedLabel(summary.bedRange.min, summary.bedRange.max)}
          </span>
        </div>
        {summary.avgSeaProximityKm > 0 && (
          <div className="flex items-baseline justify-between gap-3">
            <span>To coast</span>
            <span className="text-foreground">
              <span className="mono-num">
                {summary.avgSeaProximityKm.toFixed(1)}
              </span>{" "}
              km
            </span>
          </div>
        )}
      </div>

      <Link
        href={`/properties/${summary.slug}`}
        className="text-[11px] font-medium text-[var(--brand-secondary)] transition-colors hover:text-foreground"
      >
        View neighborhood →
      </Link>
    </div>
  );
}
