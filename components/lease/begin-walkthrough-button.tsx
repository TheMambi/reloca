"use client";

import { useState, useTransition } from "react";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createWalkthrough } from "@/app/lease/move-out-actions";

export function BeginWalkthroughButton() {
  const [pending, startBegin] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startBegin(async () => {
      try {
        await createWalkthrough();
        // No need to navigate — the parent RSC re-renders via revalidatePath.
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't start.");
      }
    });
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="gap-2"
      >
        <ClipboardCheck className="size-4" strokeWidth={1.75} />
        {pending ? "Starting…" : "Begin walkthrough"}
      </Button>
      {error ? (
        <p
          role="alert"
          className="text-[11px] text-[var(--danger)]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
