"use client";

import { useOptimistic, useTransition, startTransition } from "react";
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

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Heart sits inside the card's <Link>. Stop the click from navigating.
    e.preventDefault();
    e.stopPropagation();

    const next = !optimisticSaved;
    startTransition(() => {
      applyOptimistic(next);
    });

    startServerTransition(async () => {
      try {
        if (next) {
          await saveNeighborhood(neighborhood, city);
        } else if (savedId) {
          await unsaveNeighborhood(savedId);
        }
      } catch (err) {
        // Why: the parent RSC re-renders after the action's revalidatePath, so
        // the optimistic flip rolls back automatically — just log and move on.
        console.error("save-neighborhood toggle failed", err);
      }
    });
  };

  const label = optimisticSaved
    ? "Saved — click to remove"
    : "Save neighborhood";

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      aria-pressed={optimisticSaved}
      title={label}
      className="grid size-8 place-items-center rounded-[var(--radius-sm)] text-muted-foreground transition-colors hover:bg-card/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
    </button>
  );
}
