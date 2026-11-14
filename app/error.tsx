"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[calc(100svh-3rem)] flex-col items-center justify-center gap-4 p-6 text-center">
      <span className="grid size-10 place-items-center rounded-[var(--radius-md)] bg-[var(--danger)]/15">
        <AlertTriangle className="size-5 text-[var(--danger)]" strokeWidth={1.75} />
      </span>
      <h1 className="text-lg font-semibold tracking-[var(--tracking-headline)]">
        This page couldn&apos;t load
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Something went wrong while fetching your data. Nothing was changed. Try
        again in a moment.
      </p>
      <Button type="button" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
