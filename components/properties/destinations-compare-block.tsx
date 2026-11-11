import type { Destination } from "@/schemas/lease";
import { DestinationsCompareTable } from "./destinations-compare-table";
import { AddDestinationDialog } from "./add-destination-dialog";

interface DestinationsCompareBlockProps {
  destinations: Destination[];
}

export function DestinationsCompareBlock({
  destinations,
}: DestinationsCompareBlockProps) {
  const count = destinations.length;
  return (
    <section
      aria-labelledby="destinations-compare-heading"
      className="rounded-[var(--radius-md)] border border-border bg-card"
    >
      <header className="flex items-baseline justify-between border-b border-border px-6 py-4">
        <div className="flex items-baseline gap-3">
          <span
            id="destinations-compare-heading"
            className="label-cap text-[10px] text-muted-foreground"
          >
            PROPERTIES · COMPARE
          </span>
          <span className="mono-num text-xs text-muted-foreground">
            {count} saved
          </span>
        </div>
        <AddDestinationDialog />
      </header>

      {count === 0 ? (
        <EmptyState />
      ) : (
        <div className="px-2 py-4 md:px-4">
          <DestinationsCompareTable destinations={destinations} />
          {count === 1 ? (
            <p className="px-3 pt-4 text-xs text-muted-foreground">
              Add a second property to compare them side by side.
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

function EmptyState() {
  return (
    <div className="px-6 py-10">
      <p className="text-sm text-foreground">No properties saved yet.</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Click &ldquo;+ ADD A PROPERTY&rdquo; above to paste a website or type
        in the details by hand.
      </p>
    </div>
  );
}
