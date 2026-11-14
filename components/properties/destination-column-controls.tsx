"use client";

// Per-destination header chrome: building name + active pill + edit + delete.
// Used by both the desktop grid column header and the mobile stacked card.

import { useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { AddDestinationDialog } from "./add-destination-dialog";
import { deleteDestination } from "@/app/lease/actions";
import { settle } from "@/lib/settle-action";

import type { Destination } from "@/schemas/lease";

interface Props {
  destination: Destination;
}

export function DestinationColumnControls({ destination }: Props) {
  const [isDeletePending, startDelete] = useTransition();

  function handleDelete() {
    const ok = window.confirm(
      `Delete "${destination.building_name}"? This cannot be undone.`,
    );
    if (!ok) return;
    startDelete(async () => {
      const res = await settle(deleteDestination(destination.id));
      if (!res.ok) window.alert(res.error);
    });
  }

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-medium text-foreground">
          {destination.building_name}
        </h3>
        {destination.is_active_target ? (
          <div className="label-cap mt-1 text-[9px] text-[var(--brand-secondary)] tracking-wider">
            ACTIVE TARGET
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        <AddDestinationDialog
          destination={destination}
          trigger={
            <button
              type="button"
              aria-label={`Edit ${destination.building_name}`}
              className="rounded-[var(--radius-sm)] border border-transparent p-1 text-muted-foreground transition-colors hover:border-border hover:bg-background/60 hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          }
        />
        <button
          type="button"
          aria-label={`Delete ${destination.building_name}`}
          onClick={handleDelete}
          disabled={isDeletePending}
          className="rounded-[var(--radius-sm)] border border-transparent p-1 text-muted-foreground transition-colors hover:border-border hover:bg-background/60 hover:text-[var(--danger)] disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
