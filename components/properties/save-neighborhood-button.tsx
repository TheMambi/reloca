"use client";

import { useOptimistic, useState, useTransition, startTransition } from "react";
import { Heart } from "lucide-react";
import {
  saveNeighborhood,
  unsaveNeighborhood,
} from "@/app/properties/actions";

interface SaveNeighborhoodButtonProps {
  city: string;
  neighborhood: string;
  savedId: string | null;
}

export function SaveNeighborhoodButton({
  city,
  neighborhood,
  savedId,
}: SaveNeighborhoodButtonProps) {
  const initialSaved = savedId !== null;
  const [optimisticSaved, applyOptimistic] = useOptimistic(
    initialSaved,
    (_current, next: boolean) => next,
  );
  const [, startServerTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Heart sits inside the card's <Link>. Stop the click from navigating.
    e.preventDefault();
    e.stopPropagation();

    const next = !optimisticSaved;
    startTransition(() => {
      applyOptimistic(next);
    });

    setFailed(false);
    startServerTransition(async () => {
      // The optimistic flip rolls back by itself when the action ends without
      // a change, so a failure only needs to be shown.
      try {
        const result = next
          ? await saveNeighborhood(neighborhood, city)
          : savedId
            ? await unsaveNeighborhood(savedId)
            : null;
        if (result && !result.ok) setFailed(true);
      } catch (err) {
        console.error("save-neighborhood toggle failed", err);
        setFailed(true);
      }
    });
  };

  const label = failed
    ? "That wasn't saved. Click to try again"
    : optimisticSaved
      ? "Saved — click to remove"
      : "Save neighborhood";

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      aria-pressed={optimisticSaved}
      title={label}
      className={`grid size-8 place-items-center rounded-[var(--radius-sm)] text-muted-foreground transition-colors hover:bg-card/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${failed ? "ring-1 ring-[var(--danger)]" : ""}`}
    >
      <Heart
        className={
          optimisticSaved
            ? "size-3.5 text-[var(--brand-secondary)]"
            : "size-3.5"
        }
        fill={optimisticSaved ? "currentColor" : "none"}
        strokeWidth={1.75}
      />
      {failed && (
        <span role="alert" className="sr-only">
          The neighborhood wasn&apos;t saved. Try again.
        </span>
      )}
    </button>
  );
}
