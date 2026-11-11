import type { Metadata } from "next";
import {
  CheckSquare,
  ListChecks,
  AlertTriangle,
} from "lucide-react";
import { getChecklistItems } from "@/lib/data/checklist-db";
import { ChecklistList } from "@/components/checklist/checklist-list";

export const metadata: Metadata = {
  title: "Checklist",
  description:
    "Relocation checklist grouped by time phase — from pre-move planning to post-move — including statutory deadlines.",
};

export const dynamic = "force-dynamic";

export default async function ChecklistPage() {
  const items = await getChecklistItems();

  const totalItems = items.length;
  const statutoryCount = items.filter(
    (i) => i.description?.toUpperCase().includes("STATUTORY") ?? false,
  ).length;
  const phases = new Set(items.map((i) => i.category));

  return (
    <div className="flex min-h-[calc(100svh-3rem)] flex-col gap-6 p-6">
      {/* ─── Header ─── */}
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-[var(--radius-md)] bg-[var(--tint-checklist)]">
          <CheckSquare className="size-5 text-[var(--warn)]" strokeWidth={1.75} />
        </span>
        <div>
          <h1 className="text-lg font-semibold tracking-[var(--tracking-headline)]">
            Checklist
          </h1>
          <p className="text-xs text-muted-foreground">
            Phase-bucketed relocation tasks with statutory deadlines
          </p>
        </div>
      </div>

      {/* ─── Context strip ─── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <ListChecks className="size-3.5" strokeWidth={1.75} />
          <span className="label-cap text-[10px]">{totalItems} ITEMS</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="label-cap text-[10px]">{phases.size} PHASES</span>
        </span>
        <span className="flex items-center gap-2">
          <AlertTriangle className="size-3.5 text-[var(--danger)]" strokeWidth={1.75} />
          <span className="label-cap text-[10px] text-[var(--danger)]">
            {statutoryCount} STATUTORY
          </span>
        </span>
      </div>

      {/* ─── Interactive list (client) ─── */}
      <ChecklistList items={items} />
    </div>
  );
}
