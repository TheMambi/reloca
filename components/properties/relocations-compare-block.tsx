import type { RelocationCompareColumn } from "@/lib/data/relocation-compare";
import { RelocationsCompareTable } from "./relocations-compare-table";
import { SourceTagList } from "@/components/shared/source-tag";

export function RelocationsCompareBlock({
  columns,
}: {
  columns: RelocationCompareColumn[];
}) {
  return (
    <section
      aria-labelledby="relocations-compare-heading"
      className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-6 py-4">
        <span
          id="relocations-compare-heading"
          className="label-cap text-xs tracking-wider text-muted-foreground"
        >
          RELOCATIONS · COMPARE
        </span>
        <span className="mono-num text-xs text-muted-foreground">
          {columns.length} {columns.length === 1 ? "relocation" : "relocations"}
        </span>
      </header>

      {columns.length < 2 ? (
        <div className="px-6 py-10 text-center">
          <p className="text-sm text-foreground">
            Add a second relocation to compare
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-xs text-muted-foreground">
            Use the route switcher at the top of the screen to create another
            relocation — then both show here side by side, city facts and all.
          </p>
        </div>
      ) : (
        <>
          <div className="p-4 sm:p-6">
            <RelocationsCompareTable columns={columns} />
          </div>
          <footer className="border-t border-border px-6 py-4">
            <p className="label-cap mb-1.5 text-[9px] tracking-wider text-muted-foreground">
              Where these numbers come from
            </p>
            <SourceTagList ids={columns.flatMap((c) => c.sources)} />
          </footer>
        </>
      )}
    </section>
  );
}
