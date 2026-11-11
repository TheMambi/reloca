// SavedCompareBlock — wraps <NeighborhoodCompareTable> in the same hairline
// card chrome as <DestinationsCompareBlock>. When nothing is saved yet, shows
// a plain-English empty state pointing at the Neighborhoods tab.

import type { NeighborhoodCompareView } from "@/lib/data/neighborhood-compare";
import { NeighborhoodCompareTable } from "./neighborhood-compare-table";

interface SavedCompareBlockProps {
  view: NeighborhoodCompareView | null;
  savedCount: number;
}

export function SavedCompareBlock({ view, savedCount }: SavedCompareBlockProps) {
  return (
    <section
      aria-labelledby="saved-compare-heading"
      className="rounded-[var(--radius-md)] border border-border bg-card"
    >
      <header className="flex items-baseline justify-between border-b border-border px-6 py-4">
        <div className="flex items-baseline gap-3">
          <span
            id="saved-compare-heading"
            className="label-cap text-[10px] text-muted-foreground"
          >
            SAVED · COMPARE
          </span>
          <span className="mono-num text-xs text-muted-foreground">
            {savedCount} saved
          </span>
        </div>
      </header>

      {view === null ? (
        <EmptyState />
      ) : (
        <div className="px-2 py-4 md:px-4">
          <NeighborhoodCompareTable view={view} />
        </div>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="px-6 py-10">
      <p className="text-sm text-foreground">No saved neighborhoods yet.</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Go to the Neighborhoods tab and heart-save a few to compare them here.
      </p>
    </div>
  );
}
