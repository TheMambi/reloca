"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EstimatorForm } from "./estimator-form";
import { ScenariosCompare } from "./scenarios-compare";
import type { MoveEstimate } from "@/schemas/move-cost";
import { formatCurrency } from "@/lib/moving-cost/format";

interface Props {
  estimate: MoveEstimate;
}

export function MoveCostView({ estimate }: Props) {
  const [editingBasics, setEditingBasics] = useState(false);

  const chosen =
    estimate.chosen_scenario_id == null
      ? null
      : estimate.scenarios.find((s) => s.id === estimate.chosen_scenario_id) ?? null;

  const cheapest =
    estimate.scenarios.length === 0
      ? null
      : estimate.scenarios.reduce((m, s) => (s.total < m.total ? s : m), estimate.scenarios[0]);

  const headlineTotal = chosen?.total ?? cheapest?.total ?? 0;
  const headlineLabel = chosen?.label ?? (cheapest ? `${cheapest.label} — cheapest` : "—");

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-[var(--radius-md)] border border-border bg-card/80 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="label-cap text-[10px] tracking-wider text-muted-foreground">
              WHAT IT&rsquo;LL COST
            </p>
            <p className="mono-num mt-1 text-3xl font-semibold leading-none text-foreground">
              {formatCurrency(headlineTotal)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {headlineLabel}
            </p>
          </div>
          <div className="text-right text-[11px] text-muted-foreground">
            <p className="mono-num">
              {estimate.distance_miles == null ? "—" : `${estimate.distance_miles} mi`}
            </p>
            <p className="mono-num">
              {estimate.volume_cuft == null ? "—" : `${estimate.volume_cuft} cu ft`}
            </p>
            <p className="mono-num">{estimate.move_date ?? "—"}</p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
          <p className="text-[11px] text-muted-foreground">
            {chosen
              ? "You picked this option."
              : "Pick an option below to lock it in."}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditingBasics((p) => !p)}
            className="gap-1.5"
          >
            <Pencil className="size-3.5" strokeWidth={1.75} />
            {editingBasics ? "Hide basics" : "Edit basics"}
          </Button>
        </div>

        {editingBasics ? (
          <div className="mt-4">
            <EstimatorForm
              variant="re-edit"
              initial={{
                distance_miles: estimate.distance_miles,
                volume_cuft: estimate.volume_cuft,
                move_date: estimate.move_date,
              }}
              onSaved={() => setEditingBasics(false)}
            />
          </div>
        ) : null}
      </section>

      <ScenariosCompare estimate={estimate} />
    </div>
  );
}
