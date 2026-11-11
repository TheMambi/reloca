import * as maplibregl from "maplibre-gl";

// MapLibre 6 loads its worker from a file beside its own bundle, which
// Turbopack does not emit. scripts/copy-maplibre-worker.mjs copies the
// installed worker into public/ on every install, so the two stay in step.
maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

// CARTO serves raster basemaps only with an API key (free tier). The key ships
// to the browser by design; restrict it to the app's hosts in CARTO's dashboard.
const cartoKey = process.env.NEXT_PUBLIC_CARTO_API_KEY;

export const CARTO_DARK_SOURCE: maplibregl.RasterSourceSpecification = {
  type: "raster",
  tiles: [
    `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png${cartoKey ? `?key=${encodeURIComponent(cartoKey)}` : ""}`,
  ],
  tileSize: 256,
  attribution: "© OpenStreetMap contributors, © CARTO",
};

export { maplibregl };
