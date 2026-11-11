import { Skeleton } from "@/components/ui/skeleton";

export default function LeaseLoading() {
  return (
    <div className="flex min-h-[calc(100svh-3rem)] flex-col gap-6 p-6">
      <section
        aria-busy="true"
        className="rounded-[var(--radius-md)] border border-border bg-card p-6"
      >
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-3 h-4 w-2/3" />
        <Skeleton className="mt-2 h-3 w-1/2" />
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </section>

      <section
        aria-busy="true"
        className="rounded-[var(--radius-md)] border border-border bg-card p-6"
      >
        <div className="flex items-center justify-between">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="mt-6 space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </section>
    </div>
  );
}
