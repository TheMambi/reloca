import { Calculator } from "lucide-react";
import { ModuleCard, MetaCell } from "./operations-grid";
import { getMoveEstimate } from "@/lib/data/move-cost-db";
import { formatCurrency } from "@/lib/moving-cost/format";

export async function MovingCostCard() {
  const estimate = await getMoveEstimate();

  const baseProps = {
    href: "/moving-cost",
    icon: <Calculator className="size-5" strokeWidth={1.75} />,
    iconClass: "text-[var(--warn)]",
    iconBg: "bg-[var(--warn)]/14",
    code: "MOVING COST",
    title: "Moving cost",
    description: "Three ways to move, side by side.",
    ctaLabel: "Open",
  };

  if (!estimate) {
    return (
      <ModuleCard
        {...baseProps}
        metaRow={
          <p className="text-xs text-muted-foreground italic">Not estimated</p>
        }
      />
    );
  }

  // Pick the headline scenario: user's choice if any, otherwise cheapest. The
  // tile shows whichever total is most actionable — once they pick one, that's
  // what they're on the hook for.
  const chosen =
    estimate.chosen_scenario_id == null
      ? null
      : estimate.scenarios.find((s) => s.id === estimate.chosen_scenario_id) ??
        null;
  const cheapest =
    estimate.scenarios.length === 0
      ? null
      : estimate.scenarios.reduce(
          (m, s) => (s.total < m.total ? s : m),
          estimate.scenarios[0],
        );

  const headline = chosen ?? cheapest;
  const headlineTotal = headline?.total ?? 0;
  const statusLabel = chosen ? "Picked" : "Lowest";
  const statusTone: "ok" | "muted" = chosen ? "ok" : "muted";

  return (
    <ModuleCard
      {...baseProps}
      metaRow={
        <div className="grid flex-1 grid-cols-3 gap-3">
          <MetaCell value={formatCurrency(headlineTotal)} label="Estimate" />
          <MetaCell value={statusLabel} label="Status" tone={statusTone} />
          <MetaCell
            value={String(estimate.scenarios.length)}
            label="Options"
            tone="muted"
          />
        </div>
      }
    />
  );
}
