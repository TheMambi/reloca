import type { LeaseTerms } from "@/schemas/lease";

// Status pill states. Coral is mapped to `--brand-secondary` per the warm-decoration
// vocabulary (off-chrome status data is allowed to use coral here, design §3.1).
export type PillTone = "info" | "warn" | "coral" | "danger" | "ok";

export type PillState = {
  label: string;
  tone: PillTone;
};

// Pure: callable from tests without a DOM. `daysUntilSendBy` is computed by
// `getLeaseStatus()`; `noticeSentDate` is the ISO date of the `notice_sent` event.
// Single source of truth for the lease decision-deadline pill — consumed by both
// the /lease cell (`DecisionDeadlineTracker`) and the global `StatusRow` pill.
export function computeDeadlinePill(
  daysUntilSendBy: number | null,
  noticeSent: boolean,
  noticeSentDate: string | null,
  decision: LeaseTerms["decision"] | null,
): PillState {
  if (decision === "renew") return { label: "LEASE · RENEWED", tone: "info" };
  if (noticeSent && noticeSentDate) {
    return { label: `NOTICE SENT · ${formatPillDate(noticeSentDate)}`, tone: "ok" };
  }
  if (daysUntilSendBy === null) return { label: "—", tone: "info" };
  if (daysUntilSendBy <= 2) return { label: "CRITICAL", tone: "danger" };
  if (daysUntilSendBy <= 7) return { label: "URGENT", tone: "coral" };
  if (daysUntilSendBy <= 14) return { label: "ATTENTION", tone: "warn" };
  return { label: "ON TRACK", tone: "info" };
}

export type TMinus = { headline: string; sub: string };

// Headline for the /lease T-MINUS cell. Once the notice is out the send-by
// countdown is moot, so it reports whether the notice beat the deadline
// instead of reading "Overdue" beside a "Notice sent" pill.
export function computeTMinus(
  daysUntilSendBy: number | null,
  pastMoveOut: boolean,
  noticeSentDate: string | null,
  sendByDate: string | null,
): TMinus {
  if (pastMoveOut) return { headline: "Done", sub: "MOVED OUT" };
  if (noticeSentDate) {
    if (!sendByDate) return { headline: "Sent", sub: "" };
    const late = Math.round(
      (Date.parse(noticeSentDate + "T00:00:00Z") - Date.parse(sendByDate + "T00:00:00Z")) / 86_400_000,
    );
    return late > 0
      ? { headline: "Sent", sub: `${late} ${late === 1 ? "DAY" : "DAYS"} LATE` }
      : { headline: "Sent", sub: "ON TIME" };
  }
  if (daysUntilSendBy === null) return { headline: "—", sub: "" };
  if (daysUntilSendBy > 0) {
    return { headline: `${daysUntilSendBy}d`, sub: `${daysUntilSendBy} ${daysUntilSendBy === 1 ? "DAY" : "DAYS"}` };
  }
  if (daysUntilSendBy === 0) return { headline: "0d", sub: "TODAY" };
  const past = Math.abs(daysUntilSendBy);
  return { headline: "Overdue", sub: `${past} ${past === 1 ? "DAY" : "DAYS"} PAST` };
}

// "OCT 8" — short form for the pill's `NOTICE SENT · …` label. UTC throughout
// to keep date-only ISO strings stable across timezones.
function formatPillDate(iso: string): string {
  const d = new Date(iso + "T00:00:00.000Z");
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase();
  const day = d.toLocaleString("en-US", { day: "2-digit", timeZone: "UTC" });
  return `${month} ${day}`;
}

// Tailwind class map for pill backgrounds/borders/text. Co-located here so both
// the /lease tracker cell and the StatusRow pill render identically.
export const PILL_TONE_CLASSES: Record<PillTone, string> = {
  info: "border-[oklch(var(--info-raw)/0.3)] bg-[oklch(var(--info-raw)/0.12)] text-[var(--info)]",
  warn: "border-[oklch(var(--warn-raw)/0.3)] bg-[oklch(var(--warn-raw)/0.12)] text-[var(--warn)]",
  coral:
    "border-[oklch(var(--brand-secondary-raw)/0.3)] bg-[oklch(var(--brand-secondary-raw)/0.12)] text-[var(--brand-secondary)]",
  danger:
    "border-[oklch(var(--danger-raw)/0.3)] bg-[oklch(var(--danger-raw)/0.12)] text-[var(--danger)]",
  ok: "border-[oklch(var(--ok-raw)/0.3)] bg-[oklch(var(--ok-raw)/0.12)] text-[var(--ok)]",
};
