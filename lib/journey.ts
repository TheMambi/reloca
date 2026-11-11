// Journey-phase derivation (Wave 1, AD-039).
//
// The right-rail Journey panel and the hero's JOURNEY pill previously
// hardcoded "Foundations · Now" — wrong three days before the move and still
// wrong months after it. The phase is now derived from the same execution
// state the rest of the cockpit reads: the lease decision, whether notice was
// sent, and whether the move date has passed. Pure and dependency-free so the
// mapping is unit-testable.

export type JourneyPhaseId = "foundations" | "design" | "execute" | "settle";

export const JOURNEY_PHASES: { id: JourneyPhaseId; name: string }[] = [
  { id: "foundations", name: "Foundations" },
  { id: "design", name: "Design" },
  { id: "execute", name: "Execute" },
  { id: "settle", name: "Settle" },
];

export interface JourneyInput {
  /** ISO YYYY-MM-DD. */
  today: string;
  /** Active move's date, null when unset. */
  moveDate: string | null;
  /** True when a `notice_sent` lease event exists. */
  noticeSent: boolean;
  /** Lease decision; null when no lease is tracked. */
  decision: "undecided" | "renew" | "vacate" | "m2m" | null;
}

/**
 * Foundations — exploring, no commitments yet.
 * Design      — a direction exists (lease decision made) but nothing sent.
 * Execute     — notice is out; the move is in motion.
 * Settle      — the move date has passed.
 */
export function deriveJourneyPhase(input: JourneyInput): JourneyPhaseId {
  if (input.moveDate && input.today >= input.moveDate) return "settle";
  if (input.noticeSent) return "execute";
  if (input.decision && input.decision !== "undecided") return "design";
  return "foundations";
}

export function journeyPhaseName(id: JourneyPhaseId): string {
  return JOURNEY_PHASES.find((p) => p.id === id)?.name ?? "Foundations";
}
