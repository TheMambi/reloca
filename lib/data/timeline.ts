// Timeline event aggregator (Task 7.35).
//
// Phase 7's relocation timeline tile (Task 7.36) needs a single sorted list
// of every dated thing the user cares about — lease milestones, the moment
// notice was sent, checklist due dates, utility scheduled cutovers, address-
// update deadlines. Rather than persisting a separate `temporal_events`
// table (AD-023), we aggregate the source rows on every dashboard render.
// Volume is < 100 events at single-user scale; the cost is the round-trip
// to Postgres, which is already amortized by `react.cache` on each loader.
//
// `aggregateTimelineEvents` is a pure function so it's unit-testable.
// `getTimelineEvents` is the server wrapper that pulls from the live DB.

import { cache } from "react";
import {
  getActiveLease,
  getLeaseEvents,
} from "@/lib/data/lease-db";
import { getActiveMoveContext } from "@/lib/data/relocation-db";
import { getChecklistItems } from "@/lib/data/checklist-db";
import {
  getUtilityTransitions,
  getAddressTargets,
} from "@/lib/data/transitions-db";
import type { LeaseTerms, LeaseEvent } from "@/schemas/lease";
import type { ChecklistItem } from "@/schemas";
import type {
  UtilityTransition,
  AddressChangeTarget,
} from "@/schemas/transitions";

export type TimelineTone = "ok" | "warn" | "info" | "danger" | "neutral";

export type TimelineSource =
  | "lease"
  | "lease_event"
  | "checklist"
  | "utility"
  | "address";

export type TimelineEvent = {
  source: TimelineSource;
  source_id: string;
  /** Routing key for the timeline tile's click handler. */
  kind: string;
  /** User-facing English. Pre-screened against the User-facing copy rule. */
  label: string;
  /** ISO YYYY-MM-DD. */
  at: string;
  tone: TimelineTone;
};

export type TimelineInput = {
  lease: LeaseTerms | null;
  leaseEvents: LeaseEvent[];
  checklist: ChecklistItem[];
  utilities: UtilityTransition[];
  addressTargets: AddressChangeTarget[];
  /** ISO YYYY-MM-DD — pinned for tests; defaults to today server-side. */
  today: string;
  /**
   * Active move's date (null when unset). Once today is past it, dated items
   * that were never completed archive to neutral history instead of staying
   * "overdue" red forever (AD-039).
   */
  moveDate?: string | null;
};

const LEASE_EVENT_LABELS: Record<string, string> = {
  notice_send_by: "Notice send-by",
  notice_sent: "Notice sent",
  renewal_offer_expires: "Renewal offer expires",
  lease_end: "Lease ends",
  target_move_out: "Target move-out",
  walkthrough: "Move-out walkthrough",
  key_return: "Key return",
  deposit_claim_window_end: "Deposit claim window ends",
};

const UTILITY_KIND_LABELS: Record<string, string> = {
  electricity: "Electricity",
  gas: "Gas",
  water: "Water",
  trash: "Trash",
  internet: "Internet",
  tv: "TV",
  custom: "Custom utility",
};

function utilityLabel(u: UtilityTransition): string {
  const kindWord =
    u.kind === "custom"
      ? u.custom_label?.trim() || UTILITY_KIND_LABELS.custom
      : UTILITY_KIND_LABELS[u.kind] ?? u.kind;
  const sideWord = u.side === "origin" ? "shut-off" : "turn-on";
  return `${kindWord} ${sideWord}`;
}

export function aggregateTimelineEvents(input: TimelineInput): TimelineEvent[] {
  const { lease, leaseEvents, checklist, utilities, addressTargets, today } =
    input;

  // Post-move, a missed date is history, not an emergency: danger would sit on
  // the strip forever. Items dated before today archive to neutral instead.
  const moveDate = input.moveDate ?? null;
  const archivePast = moveDate !== null && today > moveDate;
  const overdueTone: TimelineTone = archivePast ? "neutral" : "danger";

  const events: TimelineEvent[] = [];

  // --- Lease milestones (synthetic markers from the lease row itself) ---
  if (lease) {
    events.push({
      source: "lease",
      source_id: lease.id,
      kind: "lease_end",
      label: LEASE_EVENT_LABELS.lease_end,
      at: lease.lease_end_date,
      tone: "info",
    });
    if (lease.target_move_out_date) {
      events.push({
        source: "lease",
        source_id: lease.id,
        kind: "target_move_out",
        label: "Move day",
        at: lease.target_move_out_date,
        tone: "warn",
      });
    }
  }

  // --- Lease events (notice send-by, notice sent, walkthrough, etc.) ---
  for (const e of leaseEvents) {
    events.push({
      source: "lease_event",
      source_id: e.id,
      kind: e.kind,
      label: LEASE_EVENT_LABELS[e.kind] ?? e.kind,
      at: e.occurs_on,
      tone:
        e.status === "done"
          ? "ok"
          : e.status === "missed"
            ? "danger"
            : e.kind === "notice_send_by" || e.kind === "renewal_offer_expires"
              ? "warn"
              : "info",
    });
  }

  // --- Checklist items with a due date ---
  for (const item of checklist) {
    if (!item.due_date) continue;
    events.push({
      source: "checklist",
      source_id: item.id,
      kind: `checklist_${item.category}`,
      label: item.title,
      at: item.due_date,
      tone: item.completed
        ? "ok"
        : item.due_date < today
          ? overdueTone
          : "neutral",
    });
  }

  // --- Utility transitions with a scheduled date ---
  for (const u of utilities) {
    if (!u.scheduled_date) continue;
    if (u.status === "skipped") continue;
    events.push({
      source: "utility",
      source_id: u.id,
      kind: `utility_${u.side}`,
      label: utilityLabel(u),
      at: u.scheduled_date,
      tone:
        u.status === "confirmed"
          ? "ok"
          : u.scheduled_date < today
            ? overdueTone
            : "info",
    });
  }

  // --- Address-update targets with a due date ---
  for (const t of addressTargets) {
    if (!t.due_date) continue;
    if (t.status === "skipped") continue;
    events.push({
      source: "address",
      source_id: t.id,
      kind: "address_update",
      label: `${t.name} address update`,
      at: t.due_date,
      tone:
        t.status === "confirmed"
          ? "ok"
          : t.due_date < today
            ? overdueTone
            : "neutral",
    });
  }

  // Stable sort: ascending by date, then by source so equal-date events
  // render in a deterministic order (lease before lease_event before checklist...).
  const sourceOrder: Record<TimelineSource, number> = {
    lease: 0,
    lease_event: 1,
    checklist: 2,
    utility: 3,
    address: 4,
  };
  return events.sort((a, b) => {
    if (a.at !== b.at) return a.at < b.at ? -1 : 1;
    return sourceOrder[a.source] - sourceOrder[b.source];
  });
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export const getTimelineEvents = cache(async (): Promise<TimelineEvent[]> => {
  const [lease, { moveDate }] = await Promise.all([
    getActiveLease(),
    getActiveMoveContext(),
  ]);
  const [leaseEvents, checklist, utilities, addressTargets] = await Promise.all(
    [
      lease ? getLeaseEvents(lease.id) : Promise.resolve([]),
      getChecklistItems(),
      getUtilityTransitions(),
      getAddressTargets(),
    ],
  );
  return aggregateTimelineEvents({
    lease,
    leaseEvents,
    checklist,
    utilities,
    addressTargets,
    today: todayIso(),
    moveDate,
  });
});

/**
 * Returns the [start, end] dates the timeline strip should render against.
 * Anchored to today on the left and the latest event (or +30 days, whichever
 * is later) on the right. Post-move (when `moveDate` is provided and passed),
 * the left edge pulls in to 30 days before the move so months of discharged
 * planning history stop compressing the strip (AD-039).
 */
export function getTimelineWindow(
  events: TimelineEvent[],
  today: string,
  moveDate?: string | null,
): { start: string; end: string } {
  if (events.length === 0) {
    const t = new Date(today);
    const end = new Date(t);
    end.setDate(end.getDate() + 30);
    return { start: today, end: end.toISOString().slice(0, 10) };
  }
  const latest = events[events.length - 1].at;
  const earliest = events[0].at;
  let start = earliest < today ? earliest : today;
  if (moveDate && today > moveDate) {
    const d = new Date(`${moveDate}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() - 30);
    const bracket = d.toISOString().slice(0, 10);
    if (bracket > start) start = bracket;
  }
  const t = new Date(today);
  t.setDate(t.getDate() + 30);
  const fallbackEnd = t.toISOString().slice(0, 10);
  const end = latest > fallbackEnd ? latest : fallbackEnd;
  return { start, end };
}
