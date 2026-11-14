import Image from "next/image";
import { Calendar, Circle, Clock } from "lucide-react";
import type { MoveContext } from "@/lib/data/relocation-db";
import { daysUntilIso } from "@/lib/dates";
import { journeyPhaseName, type JourneyPhaseId } from "@/lib/journey";

/*
  Hero composition for the Warm Premium Cockpit (AD-004).
  Background: `/Cities_Here_Sec.png` — warm dawn coastal cityscape.
  Foreground: SVG flight arc DEN → LGB, animated plane glyph along the arc.
  Atmosphere: AD-005 violet radial overlay, low opacity, behind the foreground.

  Layout: tall (min-h-[460px]+), full-bleed image, gradient veil left→transparent
  so the headline reads cleanly against the sky. Single-line headline at xl+,
  Geist Sans medium-weight (lighter than the previous semibold pass).
*/

export function OperationsHero({
  context,
  journeyPhase,
}: {
  context: MoveContext;
  /** Active move's derived phase — drives the JOURNEY pill (AD-039). */
  journeyPhase: JourneyPhaseId;
}) {
  // Reference-driven: origin/destination + countdown for the viewing relocation.
  const { moveDate: moveDateIso, originName, destinationName, originCode, destinationCode } =
    context;
  const days = daysUntilIso(moveDateIso);
  const arrived = days !== null && days < 0;

  // Single countdown vocabulary (lib/dates) — the pill flips from a countdown
  // to arrival framing once the move day passes, never "T-MINUS +3d".
  let countdownLabel = "MOVE DAY";
  let countdownValue = "— —";
  if (days !== null) {
    if (days === 0) {
      countdownValue = "TODAY";
    } else if (days > 0) {
      countdownValue = `IN ${days} ${days === 1 ? "DAY" : "DAYS"}`;
    } else {
      const n = Math.abs(days);
      countdownLabel = "MOVED";
      countdownValue = `${n} ${n === 1 ? "DAY" : "DAYS"} AGO`;
    }
  }

  const heroBlurb = arrived
    ? "You made it. Settle in, close out the old place, and wrap up the last details at your own pace."
    : "Everything for your move in one place — cost of living, places to live, neighborhood feel, your checklist, and your lease.";

  return (
    <section className="relative isolate overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card">
      <Image
        src="/Cities_Here_Sec.png"
        alt=""
        fill
        priority
        sizes="(min-width: 1280px) 70vw, 100vw"
        className="-z-10 object-cover object-right"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-[var(--card)] from-5% via-[var(--card)]/80 via-45% to-[var(--card)]/0 to-90%"
      />

      <div className="atmosphere-violet pointer-events-none absolute inset-0 -z-10 opacity-50" />

      <FlightArc originCode={originCode} destinationCode={destinationCode} />

      <Sparkle className="absolute right-[30%] top-[12%] size-3 text-[var(--brand-secondary)]" />
      <Sparkle className="absolute right-[10%] top-[62%] size-2 text-[var(--info)]" />

      <div className="relative flex min-h-[300px] flex-col p-6 lg:min-h-[340px] lg:p-8">
        <p className="label-cap text-[10px] font-semibold tracking-[0.18em] text-[var(--brand-secondary)]">
          Operations · Briefing
        </p>

        <div className="mt-3 max-w-[34rem]">
          <h1 className="font-sans text-[2.5rem] font-semibold leading-[1.0] tracking-[var(--tracking-display)] text-foreground sm:text-[3rem] xl:text-[3.25rem]">
            <span className="block xl:inline-block xl:whitespace-nowrap">
              {originName}{" "}
              <span className="inline-flex translate-y-[-0.05em] items-center px-1 text-[var(--brand-secondary)]">
                →
              </span>{" "}
              {destinationName}
            </span>
          </h1>

          <p
            className="mt-3 text-sm leading-relaxed text-muted-foreground"
            style={{ maxWidth: "26rem" }}
          >
            {heroBlurb}
          </p>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-2 pt-6">
          <Pill icon={<Calendar className="size-3" strokeWidth={1.75} />}>
            <span className="label-cap text-[9px] text-muted-foreground">{countdownLabel}</span>
            <span className="mono-num text-foreground">{countdownValue}</span>
          </Pill>
          <Pill icon={<Circle className="size-2 fill-[var(--ok)] text-[var(--ok)]" />}>
            <span className="label-cap text-[9px] text-muted-foreground">JOURNEY</span>
            <span className="mono-num text-foreground">
              {journeyPhaseName(journeyPhase).toUpperCase()}
            </span>
          </Pill>
          <Pill icon={<Clock className="size-3" strokeWidth={1.75} />}>
            <span className="label-cap text-[9px] text-muted-foreground">LAST SYNC</span>
            <span className="mono-num text-foreground">LIVE</span>
          </Pill>
        </div>
      </div>
    </section>
  );
}

function Pill({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-card/85 px-3 py-1.5 text-[11px]">
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex items-baseline gap-2">{children}</span>
    </span>
  );
}

function FlightArc({
  originCode,
  destinationCode,
}: {
  originCode: string;
  destinationCode: string;
}) {
  return (
    <svg
      viewBox="0 0 600 320"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 right-0 hidden h-full w-3/5 lg:block"
    >
      {/* No glow underlay: AD-004 bans blur-based light. The dashed arc
          carries the motion on its own (Wave 4, AD-042). */}
      <path
        d="M 95 215 Q 320 30 525 145"
        stroke="var(--brand-secondary)"
        strokeWidth="1.4"
        strokeDasharray="4 5"
        fill="none"
        opacity="0.85"
      >
        <animate
          attributeName="stroke-dashoffset"
          from="0"
          to="-90"
          dur="6s"
          repeatCount="indefinite"
        />
      </path>

      <g transform="translate(95 215)">
        <circle r="14" fill="var(--info)" opacity="0.18" />
        <circle r="7" fill="var(--info)" opacity="0.45" />
        <circle r="3.5" fill="var(--info)" />
        <text
          x="0"
          y="-22"
          textAnchor="middle"
          fontFamily="var(--font-mono)"
          fontSize="11"
          fontWeight="600"
          fill="var(--foreground)"
          letterSpacing="0.1em"
        >
          {originCode}
        </text>
      </g>

      <g transform="translate(525 145)">
        <circle r="16" fill="var(--brand-secondary)" opacity="0.18" />
        <circle r="8" fill="var(--brand-secondary)" opacity="0.5" />
        <circle r="4" fill="var(--brand-secondary)" />
        <text
          x="0"
          y="-24"
          textAnchor="middle"
          fontFamily="var(--font-mono)"
          fontSize="11"
          fontWeight="600"
          fill="var(--foreground)"
          letterSpacing="0.1em"
        >
          {destinationCode}
        </text>
      </g>

      <g
        style={{
          offsetPath: 'path("M 95 215 Q 320 30 525 145")',
          offsetRotate: "auto",
          animation: "reloca-flight 9s linear infinite",
        }}
      >
        <path
          d="M -8 0 L 8 0 M 0 -3 L 4 0 L 0 3"
          stroke="var(--foreground)"
          strokeWidth="1.4"
          strokeLinecap="round"
          fill="none"
        />
      </g>
    </svg>
  );
}

function Sparkle({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="currentColor"
    >
      <path d="M12 2 L13.6 9.4 L21 11 L13.6 12.6 L12 20 L10.4 12.6 L3 11 L10.4 9.4 Z" />
    </svg>
  );
}
