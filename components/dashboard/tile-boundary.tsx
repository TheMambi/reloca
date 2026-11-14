"use client";

import { Component, Suspense, type ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

// Each dashboard tile that fetches its own rows sits in one of these. A slow
// query holds back only its tile, and a failed one shows a short message in
// that tile's place while the others stay on screen.
export function TileBoundary({ title, children }: { title: string; children: ReactNode }) {
  return (
    <TileErrorBoundary title={title}>
      <Suspense fallback={<TileSkeleton title={title} />}>{children}</Suspense>
    </TileErrorBoundary>
  );
}

function TileSkeleton({ title }: { title: string }) {
  return (
    <section
      aria-busy="true"
      aria-label={`Loading ${title}`}
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
  );
}

class TileErrorBoundary extends Component<
  { title: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section
        role="status"
        className="rounded-[var(--radius-lg)] border border-border bg-card p-4"
      >
        <p className="text-sm font-medium text-foreground">{this.props.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          This part of the dashboard couldn&apos;t be loaded. Reload the page to try again.
        </p>
      </section>
    );
  }
}
