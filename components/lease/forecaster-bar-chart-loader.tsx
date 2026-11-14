"use client";

import dynamic from "next/dynamic";
import type { ForecastBar } from "@/lib/lease/forecast";

// The charting library is about 110 kB gzipped and only the Forecast tab draws
// with it. Importing it here, with no server render, means the browser fetches
// it when this component first mounts, which is when that tab is opened. A
// dynamic import written in the server component would not help: the chart
// would still be part of the page's first load.
const ForecasterBarChart = dynamic(
  () => import("./forecaster-bar-chart").then((m) => m.ForecasterBarChart),
  {
    ssr: false,
    loading: () => (
      <div
        role="status"
        aria-label="Loading the chart"
        className="h-56 w-full animate-pulse rounded-[var(--radius-md)] bg-border/30"
      />
    ),
  },
);

export function ForecasterBarChartLoader(props: {
  bars: ForecastBar[];
  activeKey: ForecastBar["key"];
}) {
  return <ForecasterBarChart {...props} />;
}
