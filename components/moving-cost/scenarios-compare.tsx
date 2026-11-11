"use client";

import { useState, useTransition } from "react";
import { Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { selectScenario } from "@/app/moving-cost/actions";
import type { MoveEstimate, Scenario } from "@/schemas/move-cost";
import { formatCurrency } from "@/lib/moving-cost/format";
import { LineItemsEditor } from "./line-items-editor";

interface Props {
  estimate: MoveEstimate;
}

export function ScenariosCompare({ estimate }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingScenario =
    editingId === null ? null : estimate.scenarios.find((s) => s.id === editingId) ?? null;

  return (
    <>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {estimate.scenarios.map((s) => (
          <ScenarioCard
            key={s.id}
            scenario={s}
            chosen={estimate.chosen_scenario_id === s.id}
            onEdit={() => setEditingId(s.id)}
          />
        ))}
      </div>

      {editingScenario ? (
        <LineItemsEditor
          open={editingId !== null}
          onOpenChange={(open) => {
            if (!open) setEditingId(null);
          }}
          scenario={editingScenario}
        />
      ) : null}
    </>
  );
}

function ScenarioCard({
  scenario,
  chosen,
  onEdit,
}: {
  scenario: Scenario;
  chosen: boolean;
  onEdit: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChoose() {
    setError(null);
    startTransition(async () => {
      const result = await selectScenario(scenario.id);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <article
      className={
        "relative flex flex-col rounded-[var(--radius-md)] border bg-card/80 p-4 " +
        (chosen
          ? "border-l-2 border-l-[var(--brand-secondary)] border-y-border border-r-border"
          : "border-border")
      }
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="label-cap text-[10px] tracking-wider text-muted-foreground">
            OPTION
          </p>
          <h3 className="mt-0.5 text-sm font-semibold text-foreground">
            {scenario.label}
          </h3>
        </div>
        {chosen ? (
          <span
            className="label-cap inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-[oklch(var(--brand-secondary-raw)/0.3)] bg-[oklch(var(--brand-secondary-raw)/0.12)] px-1.5 py-0.5 text-[10px] tracking-wider text-[var(--brand-secondary)]"
          >
            <Check className="size-3" strokeWidth={2} />
            CHOSEN
          </span>
        ) : null}
      </header>

      <p className="mono-num mt-3 text-2xl font-semibold leading-none text-foreground">
        {formatCurrency(scenario.total)}
      </p>
      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {scenario.line_items.length} cost
        {scenario.line_items.length === 1 ? "" : "s"} listed
      </p>

      <ul className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
        {scenario.line_items.length === 0 ? (
          <li className="text-xs text-muted-foreground italic">
            No costs added yet
          </li>
        ) : (
          scenario.line_items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="truncate text-muted-foreground">{item.name}</span>
              <span className="mono-num shrink-0 text-foreground">
                {formatCurrency(item.cost)}
              </span>
            </li>
          ))
        )}
      </ul>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-[var(--radius-sm)] border border-[oklch(var(--danger-raw)/0.3)] bg-[oklch(var(--danger-raw)/0.1)] px-2 py-1.5 text-[11px] text-[var(--danger)]"
        >
          {error}
        </p>
      ) : null}

      <footer className="mt-auto flex items-center gap-2 pt-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onEdit}
          className="gap-1.5"
        >
          <Pencil className="size-3.5" strokeWidth={1.75} />
          Edit costs
        </Button>
        {chosen ? null : (
          <Button
            type="button"
            size="sm"
            onClick={handleChoose}
            disabled={isPending}
            className="ml-auto"
          >
            {isPending ? "Picking…" : "Pick this option"}
          </Button>
        )}
      </footer>
    </article>
  );
}
