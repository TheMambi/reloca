import { KeyRound } from "lucide-react";
import { ModuleCard, MetaCell } from "./operations-grid";
import { getActiveLease, getLeaseEvents } from "@/lib/data/lease-db";
import { daysUntilIso, todayInZoneIso } from "@/lib/dates";

// Friendly labels for the lease decision enum. Matches AtAGlance's voice —
// no schema-leak words ("vacate" / "m2m") in user-facing copy.
const DECISION_LABEL: Record<
  "undecided" | "renew" | "vacate" | "m2m",
  string
> = {
  undecided: "Undecided",
  renew: "Renewing",
  vacate: "Moving out",
  m2m: "Month-to-month",
};

const dateFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});

export async function LeaseCard() {
  const lease = await getActiveLease();

  const baseProps = {
    href: "/lease",
    icon: <KeyRound className="size-5" strokeWidth={1.75} />,
    iconClass: "text-[var(--brand-secondary)]",
    iconBg: "bg-[var(--brand-secondary)]/14",
    code: "LEASE",
    title: "Lease",
    description: "Notice, decision, deposit.",
    ctaLabel: "Open",
  };

  if (!lease) {
    return (
      <ModuleCard
        {...baseProps}
        metaRow={
          <p className="text-xs text-muted-foreground italic">
            No lease tracked
          </p>
        }
      />
    );
  }

  const events = await getLeaseEvents(lease.id);

  // Mirrors the leaseGlance computation in app/page.tsx — kept inline so the
  // tile is self-fetching and doesn't rely on prop plumbing.
  const todayIso = todayInZoneIso();
  const moveOutIso = lease.target_move_out_date ?? lease.lease_end_date;
  const noticeSent = events.some((e) => e.kind === "notice_sent");
  const pastMoveOut = todayIso > moveOutIso;

  // ── Cell 1: Decision ──
  const decisionLabel = DECISION_LABEL[lease.decision];

  // ── Cell 2: Notice status ──
  // Three modes:
  //   past move-out  → "Deposit" + days remaining to deposit_claim_window_end
  //   notice sent    → "Sent" (ok)
  //   otherwise      → T-NN to notice_send_by (warn ≤14 days, else info)
  let noticeValue: string;
  let noticeLabel: string;
  let noticeTone: "ok" | "warn" | "danger" | "muted" | "default";

  if (pastMoveOut) {
    const depositEvent = events.find(
      (e) => e.kind === "deposit_claim_window_end",
    );
    const depositIso = depositEvent?.occurs_on ?? null;
    const daysToDeposit = daysUntilIso(depositIso, todayIso);
    if (daysToDeposit === null) {
      noticeValue = "—";
      noticeLabel = "Deposit pending";
      noticeTone = "muted";
    } else if (daysToDeposit < 0) {
      noticeValue = "Closed";
      noticeLabel = "Deposit window";
      noticeTone = "default";
    } else {
      noticeValue = `T-${daysToDeposit}`;
      noticeLabel = "Deposit window";
      noticeTone = "default";
    }
  } else if (noticeSent) {
    noticeValue = "Sent";
    noticeLabel = "Notice";
    noticeTone = "ok";
  } else {
    const sendByEvent = events.find((e) => e.kind === "notice_send_by");
    const sendByIso = sendByEvent?.occurs_on ?? null;
    const days = daysUntilIso(sendByIso, todayIso);
    if (days === null) {
      noticeValue = "—";
      noticeLabel = "Notice";
      noticeTone = "muted";
    } else if (days < 0) {
      // Send-by date passed without a notice_sent event — surface as overdue
      // so the tile reflects the real-life consequence (locked into M2M
      // premium until the next month boundary).
      noticeValue = "Overdue";
      noticeLabel = "Notice";
      noticeTone = "danger";
    } else {
      noticeValue = `T-${days}`;
      noticeLabel = "Notice";
      noticeTone = days <= 14 ? "warn" : "default";
    }
  }

  // ── Cell 3: Move-out date ──
  const moveOutLabel = pastMoveOut ? "Moved out" : "Move-out";
  const moveOutDate = dateFmt.format(new Date(moveOutIso + "T00:00:00.000Z"));

  return (
    <ModuleCard
      {...baseProps}
      metaRow={
        <div className="grid flex-1 grid-cols-3 gap-3">
          <MetaCell value={decisionLabel} label="Decision" />
          <MetaCell value={noticeValue} label={noticeLabel} tone={noticeTone} />
          <MetaCell value={moveOutDate} label={moveOutLabel} tone="muted" />
        </div>
      }
    />
  );
}
