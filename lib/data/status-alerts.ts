import { getChecklistItems } from "@/lib/data/checklist-db";
import { getCostOfLiving, costValueFor } from "@/lib/data/cost";
import {
  getUtilityTransitions,
  getAddressTargets,
} from "@/lib/data/transitions-db";
import { getActiveMoveContext } from "@/lib/data/relocation-db";
import type { PillTone } from "@/lib/lease/pill";
import type { ChecklistItem } from "@/schemas";
import type {
  UtilityTransition,
  AddressChangeTarget,
} from "@/schemas/transitions";

export type StatusAlert = {
  id: string;
  label: string;
  href: string;
  tone: PillTone;
};

const MAX_ALERTS = 3;
const COST_DELTA_THRESHOLD_PCT = 5;

// Aggregates 0–3 actionable signals for the global status-row strip. The lease
// pill is rendered separately by StatusRow itself (it has its own placement
// next to the move-date editor); these are the right-side rolling alerts that
// replaced the static "JOURNEY · FOUNDATIONS" placeholder.
export async function getStatusAlerts(): Promise<StatusAlert[]> {
  // Wind-down (AD-039): two weeks past the move date, "overdue" stops being an
  // emergency — leftover items demote to a quiet close-out nudge instead of
  // permanent red. Inside the two-week landing window they stay loud, because
  // that's exactly when a missed utility shut-off costs money.
  let windDown = false;
  try {
    const { moveDate } = await getActiveMoveContext();
    if (moveDate) {
      const graceEnd = addDaysUtc(moveDate, 14);
      windDown = todayUtcDateString() > graceEnd;
    }
  } catch {
    // Status row must never throw; without a context, keep loud behavior.
  }

  const [checklistAlert, utilityAlert, addressAlert, costAlert] =
    await Promise.all([
      computeChecklistAlert(windDown),
      computeUtilityAlert(windDown),
      computeAddressAlert(windDown),
      computeCostAlert(),
    ]);

  const all = [checklistAlert, utilityAlert, addressAlert, costAlert].filter(
    (a): a is StatusAlert => a !== null,
  );

  // Severity-ordered so the loudest signal renders first if we ever exceed
  // MAX_ALERTS (today we only generate 2 max, but the cap is design-correct).
  const severityRank: Record<PillTone, number> = {
    danger: 0,
    coral: 1,
    warn: 2,
    info: 3,
    ok: 4,
  };
  all.sort((a, b) => severityRank[a.tone] - severityRank[b.tone]);

  return all.slice(0, MAX_ALERTS);
}

async function computeChecklistAlert(
  windDown: boolean,
): Promise<StatusAlert | null> {
  let items: ChecklistItem[];
  try {
    items = await getChecklistItems();
  } catch {
    // Status row must never throw — checklist seeding errors shouldn't crash
    // every page. Silently drop the alert; checklist page itself will surface
    // the error.
    return null;
  }

  const today = todayUtcDateString();
  const sevenDaysOut = addDaysUtc(today, 7);

  let overdueCount = 0;
  let dueThisWeekCount = 0;

  for (const item of items) {
    if (item.completed) continue;
    if (!item.due_date) continue;
    if (item.due_date < today) {
      overdueCount += 1;
    } else if (item.due_date <= sevenDaysOut) {
      dueThisWeekCount += 1;
    }
  }

  if (overdueCount > 0) {
    return {
      id: "checklist-overdue",
      label: windDown
        ? pluralize(overdueCount, "task to close out", "tasks to close out")
        : pluralize(overdueCount, "task overdue", "tasks overdue"),
      href: "/checklist",
      tone: windDown ? "info" : "danger",
    };
  }

  if (dueThisWeekCount > 0) {
    return {
      id: "checklist-due-week",
      label: pluralize(
        dueThisWeekCount,
        "task due this week",
        "tasks due this week",
      ),
      href: "/checklist",
      tone: dueThisWeekCount >= 3 ? "warn" : "info",
    };
  }

  return null;
}

async function computeUtilityAlert(
  windDown: boolean,
): Promise<StatusAlert | null> {
  let rows: UtilityTransition[];
  try {
    rows = await getUtilityTransitions();
  } catch {
    return null;
  }

  const today = todayUtcDateString();
  const threeDaysAgo = addDaysUtc(today, -3);

  let overdueCount = 0;
  let stalePendingCount = 0;
  for (const r of rows) {
    if (r.status === "skipped" || r.status === "confirmed") continue;
    if (!r.scheduled_date) continue;
    if (r.status === "needs_action" && r.scheduled_date < today) {
      overdueCount += 1;
    } else if (r.status === "scheduled" && r.scheduled_date < threeDaysAgo) {
      stalePendingCount += 1;
    }
  }

  if (overdueCount > 0) {
    return {
      id: "utility-overdue",
      label: windDown
        ? pluralize(overdueCount, "utility to close out", "utilities to close out")
        : pluralize(overdueCount, "utility overdue", "utilities overdue"),
      href: "/transitions?tab=utilities",
      tone: windDown ? "info" : "danger",
    };
  }

  if (stalePendingCount > 0) {
    return {
      id: "utility-stale",
      label: pluralize(
        stalePendingCount,
        "utility still pending",
        "utilities still pending",
      ),
      href: "/transitions?tab=utilities",
      tone: "warn",
    };
  }

  return null;
}

async function computeAddressAlert(
  windDown: boolean,
): Promise<StatusAlert | null> {
  let rows: AddressChangeTarget[];
  try {
    rows = await getAddressTargets();
  } catch {
    return null;
  }

  const today = todayUtcDateString();

  let overdueCount = 0;
  for (const r of rows) {
    if (r.status === "skipped" || r.status === "confirmed") continue;
    if (r.status !== "needs_action") continue;
    if (!r.due_date) continue;
    if (r.due_date < today) overdueCount += 1;
  }

  if (overdueCount === 0) return null;

  return {
    id: "address-overdue",
    label: windDown
      ? pluralize(
          overdueCount,
          "address update to close out",
          "address updates to close out",
        )
      : pluralize(
          overdueCount,
          "address update overdue",
          "address updates overdue",
        ),
    href: "/transitions?tab=address-updates",
    tone: windDown ? "info" : "danger",
  };
}

// City-agnostic since Wave 4 (AD-042): reads the active move's origin and
// destination instead of the hardcoded denver/long-beach pair.
async function computeCostAlert(): Promise<StatusAlert | null> {
  let originSlug: string;
  let destSlug: string;
  let destName: string;
  try {
    const ctx = await getActiveMoveContext();
    originSlug = ctx.originSlug;
    destSlug = ctx.destinationSlug;
    destName = ctx.destinationName;
  } catch {
    return null; // status row must never throw
  }

  const cost = getCostOfLiving();
  const originTotal = cost.categories.reduce(
    (sum, c) => sum + costValueFor(c, originSlug),
    0,
  );
  const destTotal = cost.categories.reduce(
    (sum, c) => sum + costValueFor(c, destSlug),
    0,
  );

  if (originTotal === 0) return null;

  const deltaPct = ((destTotal - originTotal) / originTotal) * 100;

  if (Math.abs(deltaPct) < COST_DELTA_THRESHOLD_PCT) return null;

  const deltaUsd = Math.abs(destTotal - originTotal);
  const formatted = `$${Math.round(deltaUsd).toLocaleString("en-US")}`;

  if (deltaPct > 0) {
    return {
      id: "cost-higher",
      label: `${destName} costs ${formatted}/mo more`,
      href: "/cost-of-living",
      tone: "warn",
    };
  }

  return {
    id: "cost-lower",
    label: `${destName} saves ${formatted}/mo`,
    href: "/cost-of-living",
    tone: "ok",
  };
}

function pluralize(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

function todayUtcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysUtc(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
