import type { Metadata } from "next";
import { getMoveEstimate } from "@/lib/data/move-cost-db";
import { EstimatorForm } from "@/components/moving-cost/estimator-form";
import { MoveCostView } from "@/components/moving-cost/move-cost-view";

export const metadata: Metadata = {
  title: "Moving cost",
  description:
    "Estimate the move side by side — DIY truck rental, professional movers, hybrid — and lock in the option that fits your budget.",
};

export const dynamic = "force-dynamic";

export default async function MovingCostPage() {
  const estimate = await getMoveEstimate();

  return (
    <div className="flex min-h-[calc(100svh-3rem)] flex-col gap-6 p-6">
      <header>
        <p className="label-cap text-[10px] tracking-wider text-muted-foreground">
          LOGISTICS · MOVING COST
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-[var(--tracking-headline)] text-foreground">
          What this move will cost
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Three ways to move, side by side. Adjust each cost to match real
          quotes; pick the one you want.
        </p>
      </header>

      {estimate ? <MoveCostView estimate={estimate} /> : <EstimatorForm />}
    </div>
  );
}
