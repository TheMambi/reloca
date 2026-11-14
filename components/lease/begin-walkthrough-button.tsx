"use client";

import { useState, useTransition } from "react";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createWalkthrough } from "@/app/lease/move-out-actions";
import { settle } from "@/lib/settle-action";

export function BeginWalkthroughButton() {
  const [pending, startBegin] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startBegin(async () => {
      // No need to navigate — the parent RSC re-renders via revalidatePath.
      const res = await settle(createWalkthrough());
      if (!res.ok) setError(res.error);
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
