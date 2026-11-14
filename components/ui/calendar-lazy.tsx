"use client";

import dynamic from "next/dynamic";

// The date picker brings react-day-picker and date-fns, about 25 kB gzipped.
// Every calendar in the app opens inside a popover or a dialog, so the code is
// fetched the first time one opens instead of with the page. The header's
// move date editor is on every route, which put the picker in every first load.
export const Calendar = dynamic(() => import("./calendar").then((m) => m.Calendar), {
  ssr: false,
  loading: () => (
    <div role="status" className="grid h-72 w-64 place-items-center text-xs text-muted-foreground">
      Loading the calendar
    </div>
  ),
});
