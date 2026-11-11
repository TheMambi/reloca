import { Mail } from "lucide-react";
import { ModuleCard, MetaCell } from "./operations-grid";
import { getAddressTargets } from "@/lib/data/transitions-db";

export async function AddressUpdatesCard() {
  const rows = await getAddressTargets();

  // Skipped rows excluded from "tracked" count — they're a terminal escape
  // hatch, same handling as the Lifecycle tracker's grouping.
  const tracked = rows.filter((r) => r.status !== "skipped");
  const done = tracked.filter(
    (r) => r.status === "submitted" || r.status === "confirmed",
  ).length;

  // Soonest deadline among non-confirmed tracked rows. Sort string ISO dates.
  const soonestDate =
    tracked
      .filter((r) => r.due_date && r.status !== "confirmed")
      .map((r) => r.due_date as string)
      .sort()[0] ?? null;

  const baseProps = {
    href: "/transitions?tab=address-updates",
    icon: <Mail className="size-5" strokeWidth={1.75} />,
    iconClass: "text-[var(--brand-secondary)]",
    iconBg: "bg-[var(--brand-secondary)]/14",
    code: "ADDRESS UPDATES",
    title: "Address updates",
    description: "Tell everyone who needs your new address.",
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
            value={String(done)}
            label="Done"
            tone={done > 0 ? "ok" : "muted"}
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
