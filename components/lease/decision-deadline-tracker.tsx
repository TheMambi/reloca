import type { LeaseTerms, LeaseEvent } from "@/schemas/lease";
import { computeDeadlinePill, computeTMinus, PILL_TONE_CLASSES } from "@/lib/lease/pill";
import { DecisionDropdown } from "./decision-dropdown";

// "OCT 8 · THU" — UTC throughout to keep date-only ISO strings stable across TZs.
// Cell-only formatter (longer, includes weekday). The pill uses its own shorter
// formatter co-located in `lib/lease/pill.ts`.
function formatCellDate(iso: string): string {
  const d = new Date(iso + "T00:00:00.000Z");
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase();
  const day = d.toLocaleString("en-US", { day: "2-digit", timeZone: "UTC" });
  const weekday = d.toLocaleString("en-US", { weekday: "short", timeZone: "UTC" }).toUpperCase();
  return `${month} ${day} · ${weekday}`;
}

interface DecisionDeadlineTrackerProps {
  lease: LeaseTerms;
  events: LeaseEvent[];
  daysUntilSendBy: number | null;
  /** True once today is past the (target) move-out date — terminal state (AD-039). */
  pastMoveOut?: boolean;
}

export function DecisionDeadlineTracker({
  lease,
  events,
  daysUntilSendBy,
  pastMoveOut = false,
}: DecisionDeadlineTrackerProps) {
  const sendByEvent = events.find((e) => e.kind === "notice_send_by");
  const noticeSentEvent = events.find((e) => e.kind === "notice_sent");
  const noticeSent = Boolean(noticeSentEvent);
  const noticeSentDate = noticeSentEvent?.occurs_on ?? null;

  // Past move-out the tracker is history: the pill reads "Moved out" and stops
  // counting anything, whether or not a notice_sent event was ever recorded.
  const pill = pastMoveOut
    ? { label: "MOVED OUT", tone: "ok" as const }
    : computeDeadlinePill(daysUntilSendBy, noticeSent, noticeSentDate, lease.decision);

  // Once notice has been sent (or the move-out date has passed), the deadline
  // cells lose meaning — freeze visually and lock the decision dropdown.
  const frozen = noticeSent || pastMoveOut;

  const sendByIso = sendByEvent?.occurs_on ?? null;
  const { headline: tMinusHeadline, sub: tMinusSub } = computeTMinus(
    daysUntilSendBy,
    pastMoveOut,
    noticeSentDate,
    sendByIso,
  );

  const leaseEndIso = lease.lease_end_date;

  return (
    <section
      id="decision"
      aria-labelledby="lease-decision-heading"
      className="rounded-[var(--radius-md)] border border-border bg-card"
    >
      <header className="border-b border-border px-6 py-4">
        <span
          id="lease-decision-heading"
          className="label-cap text-[10px] text-muted-foreground"
        >
          LEASE DECISION
        </span>
        <p className="mt-1 text-sm font-medium text-foreground">
          {lease.property_name}
        </p>
        <p className="text-xs text-muted-foreground">
          {lease.unit_address}, {lease.city}
        </p>
      </header>

      <div className="grid grid-cols-1 divide-y divide-border md:grid-cols-4 md:divide-x md:divide-y-0">
        {/* Cell 1: T-MINUS + status pill */}
        <div className={`flex flex-col gap-2 px-6 py-4 ${frozen ? "opacity-60" : ""}`}>
          <span className="label-cap text-[10px] text-muted-foreground">
            T-MINUS
          </span>
          <p className="mono-num text-2xl font-medium leading-none text-foreground">
            {tMinusHeadline}
          </p>
          {tMinusSub && (
            <p className="label-cap text-[9px] text-muted-foreground">
              {tMinusSub}
            </p>
          )}
          <span
            className={`label-cap mt-1 inline-flex w-full items-center justify-center rounded-[var(--radius-sm)] border px-2 py-0.5 text-[10px] tracking-wider md:w-fit md:justify-start ${PILL_TONE_CLASSES[pill.tone]}`}
          >
            {pill.label}
          </span>
        </div>

        {/* Cell 2: Decision dropdown */}
        <div className={`flex flex-col gap-2 px-6 py-4 ${frozen ? "opacity-60" : ""}`}>
          <span className="label-cap text-[10px] text-muted-foreground">
            DECISION
          </span>
          <p className="mono-num text-2xl font-medium leading-none text-foreground">
            {decisionHeadline(lease.decision)}
          </p>
          <DecisionDropdown
            leaseId={lease.id}
            current={lease.decision}
            disabled={frozen}
          />
        </div>

        {/* Cell 3: Notice send-by */}
        <div className={`flex flex-col gap-2 px-6 py-4 ${frozen ? "opacity-60" : ""}`}>
          <span className="label-cap text-[10px] text-muted-foreground">
            SEND NOTICE BY
          </span>
          <p className="mono-num text-2xl font-medium leading-none text-foreground">
            {sendByIso ? formatCellDate(sendByIso) : "—"}
          </p>
          <p className="label-cap text-[9px] text-muted-foreground">
            {sendByIso ? sendByIso.slice(0, 4) : "NOT SET"}
          </p>
        </div>

        {/* Cell 4: Lease end */}
        <div className={`flex flex-col gap-2 px-6 py-4 ${frozen ? "opacity-60" : ""}`}>
          <span className="label-cap text-[10px] text-muted-foreground">
            LEASE END
          </span>
          <p className="mono-num text-2xl font-medium leading-none text-foreground">
            {formatCellDate(leaseEndIso)}
          </p>
          <p className="label-cap text-[9px] text-muted-foreground">
            {leaseEndIso.slice(0, 4)}
          </p>
        </div>
      </div>
    </section>
  );
}

// Friendly decision labels — matches the LeaseCard voice; the raw enum values
// ("vacate", "m2m") never render (user-facing copy rule).
function decisionHeadline(decision: LeaseTerms["decision"]): string {
  switch (decision) {
    case "undecided":
      return "—";
    case "renew":
      return "RENEWING";
    case "vacate":
      return "MOVING OUT";
    case "m2m":
      return "MONTH-TO-MONTH";
  }
}
