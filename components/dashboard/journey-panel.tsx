import { Rocket, Compass, Zap, Home, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { JOURNEY_PHASES, type JourneyPhaseId } from "@/lib/journey";

// Derived, not hardcoded (Wave 1, AD-039): the active phase comes from real
// execution state via `deriveJourneyPhase` — phases before it read as done,
// after it as upcoming.

type PhaseStatus = "done" | "active" | "upcoming";

const PHASE_ICONS: Record<JourneyPhaseId, typeof Rocket> = {
  foundations: Rocket,
  design: Compass,
  execute: Zap,
  settle: Home,
};

const STATUS_HINT: Record<PhaseStatus, string> = {
  done: "Done",
  active: "Now",
  upcoming: "Coming up",
};

export function JourneyPanel({ activePhase }: { activePhase: JourneyPhaseId }) {
  const activeIdx = JOURNEY_PHASES.findIndex((p) => p.id === activePhase);

  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-card p-4">
      <header className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          Your Journey
        </h2>
        <span className="label-cap text-[9px] text-muted-foreground">04 · PHASES</span>
      </header>

      <ol className="relative mt-4 space-y-4">
        <span
          aria-hidden="true"
          className="absolute left-[19px] top-3 bottom-3 w-px bg-border"
        />

        {JOURNEY_PHASES.map((phase, idx) => {
          const status: PhaseStatus =
            idx < activeIdx ? "done" : idx === activeIdx ? "active" : "upcoming";
          return (
            <PhaseRow
              key={phase.id}
              id={phase.id}
              num={idx}
              name={phase.name}
              status={status}
            />
          );
        })}
      </ol>
    </section>
  );
}

function PhaseRow({
  id,
  num,
  name,
  status,
}: {
  id: JourneyPhaseId;
  num: number;
  name: string;
  status: PhaseStatus;
}) {
  const Icon = status === "done" ? Check : PHASE_ICONS[id];
  const isActive = status === "active";
  const isDone = status === "done";

  return (
    <li className="relative flex items-center gap-3">
      <div
        className={cn(
          "relative grid size-10 place-items-center rounded-full border",
          isActive && "border-[var(--brand-secondary)]/60 bg-[var(--brand-secondary)]/12",
          isDone && "border-border bg-muted",
          status === "upcoming" && "border-border bg-muted",
        )}
      >
        {isActive && (
          <span className="atmosphere-coral absolute inset-[-8px] rounded-full" aria-hidden="true" />
        )}
        <Icon
          className={cn(
            "relative size-4",
            isActive && "text-[var(--brand-secondary)]",
            isDone && "text-[var(--ok)]",
            status === "upcoming" && "text-muted-foreground",
          )}
          strokeWidth={1.75}
        />
      </div>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-sm font-medium",
            isActive ? "text-foreground" : "text-foreground/85",
            status === "upcoming" && "text-muted-foreground",
          )}
        >
          {name}
        </p>
        <p className="label-cap text-[9px] text-muted-foreground">
          Phase {num} · {STATUS_HINT[status]}
        </p>
      </div>
    </li>
  );
}
