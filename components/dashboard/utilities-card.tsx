import { Zap } from "lucide-react";
import { ModuleCard, MetaCell } from "./operations-grid";
import { getUtilityTransitions } from "@/lib/data/transitions-db";

export async function UtilitiesCard() {
  const rows = await getUtilityTransitions();

  // `skipped` rows are intentionally excluded (terminal escape hatch — don't
  // count toward "tracked"). Mirrors the Lifecycle tracker's grouping.
  const tracked = rows.filter((r) => r.status !== "skipped");
  const confirmed = tracked.filter((r) => r.status === "confirmed").length;

  // Soonest upcoming cutover: earliest `scheduled_date` among non-confirmed
  // tracked rows. Skips rows without a date so empty-date rows don't bubble up.
  const soonestDate =
    tracked
      .filter((r) => r.scheduled_date && r.status !== "confirmed")
      .map((r) => r.scheduled_date as string)
      .sort()[0] ?? null;

  const baseProps = {
    href: "/transitions?tab=utilities",
    icon: <Zap className="size-5" strokeWidth={1.75} />,
    iconClass: "text-[var(--info)]",
    iconBg: "bg-[var(--info)]/14",
    code: "UTILITIES",
    title: "Utilities",
    description: "Cut off old services, turn on new ones.",
    ctaLabel: "Open",
  };

  if (tracked.length === 0) {
    return (
      <ModuleCard
        {...baseProps}
        metaRow={
          <p className="text-xs text-muted-foreground italic">
            Nothing tracked yet
          </p>
        }
      />
    );
  }

  return (
    <ModuleCard
      {...baseProps}
      metaRow={
        <div className="grid flex-1 grid-cols-3 gap-3">
          <MetaCell value={String(tracked.length)} label="Tracked" />
          <MetaCell
            value={String(confirmed)}
            label="Confirmed"
            tone={confirmed > 0 ? "ok" : "muted"}
          />
          <MetaCell
            value={soonestDate ?? "—"}
            label="Next"
            tone={soonestDate ? "default" : "muted"}
          />
        </div>
      }
    />
  );
}
