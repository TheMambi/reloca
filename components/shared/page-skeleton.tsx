import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shared route-level loading skeleton (Wave 5, AD-043). Before this, only
 * /lease had a loading.tsx — every other navigation rendered nothing while
 * awaiting Supabase. One shared shape (header block + a grid of card-sized
 * placeholders) reads as the cockpit's hairline-card idiom without guessing
 * each page's exact layout.
 */
export function PageSkeleton({
  cards = 6,
  hero = false,
}: {
  /** Number of card-sized placeholders in the grid. */
  cards?: number;
  /** Adds a tall hero placeholder above the grid (dashboard). */
  hero?: boolean;
}) {
  return (
    <div
      aria-busy="true"
      className="flex min-h-[calc(100svh-3rem)] flex-col gap-4 p-6"
    >
      {hero ? (
        <Skeleton className="min-h-[300px] w-full rounded-[var(--radius-lg)] lg:min-h-[340px]" />
      ) : (
        <section className="rounded-[var(--radius-md)] border border-border bg-card p-6">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-3 h-5 w-64" />
          <Skeleton className="mt-2 h-3 w-96 max-w-full" />
        </section>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,340px),1fr))] items-start gap-3">
        {Array.from({ length: cards }, (_, i) => (
          <section
            key={i}
            className="rounded-[var(--radius-lg)] border border-border bg-card p-4"
          >
            <div className="flex items-start gap-3">
              <Skeleton className="size-10 rounded-[var(--radius-md)]" />
              <div className="flex-1">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-2 h-4 w-40 max-w-full" />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
