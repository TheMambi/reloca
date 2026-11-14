import { ListChecks, Wallet, ShieldAlert, Flag, FileText, Wallet2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { computeDeadlinePill, type PillTone } from "@/lib/lease/pill";
import type { MoveReadiness } from "@/lib/data/move-readiness";
import { getActiveMoveContext } from "@/lib/data/relocation-db";
import { countdownPhrase, countdownTone, daysUntilIso } from "@/lib/dates";

export type AtAGlanceProps = {
  /** Multi-source roll-up of readiness across checklist + lease + utility +
   * address + deposit. Drives row 1 (replaces the v1 T-MINUS countdown — that
   * info still surfaces in row 4's sub label). */
  readiness: MoveReadiness;
  risk: {
    riskPosture: string;
    riskTone: "ok" | "warn" | "danger";
  };
  /**
   * Real moving budget from the chosen (or cheapest) moving-cost scenario.
   * Null hides the row entirely — no estimate started means no fake
   * "On track" instrument (AD-039 retired the hardcoded value).
   */
  budget?: { value: string; sub?: string } | null;
  /**
   * Optional lease summary. When provided AND `exists` is true, row 3 swaps
   * from "Risks" to a lease-aware cell (LEASE NOTICE before move-out, DEPOSIT
   * WINDOW after). When absent or `exists: false`, row 3 keeps showing Risks.
   */
  lease?: LeaseGlance | null;
};

export type LeaseGlance =
  | { exists: false }
  | {
      exists: true;
      // "lease-notice" before target_move_out, "deposit-window" after.
      mode: "lease-notice" | "deposit-window";
      // True if a `notice_sent` event exists. Only meaningful in "lease-notice" mode.
      noticeSent: boolean;
      // Days until the cell's target date (send-by for lease-notice, deposit
      // claim deadline for deposit-window). Null when the underlying event is
      // missing.
      daysUntil: number | null;
      // ISO date (YYYY-MM-DD) for the trailing meta cell. Null when missing.
      dateIso: string | null;
      // Lease decision — passed through to computeDeadlinePill so a "renew"
      // decision short-circuits the tone.
      decision: "undecided" | "renew" | "vacate" | "m2m" | null;
      // Date of the `notice_sent` event, when present. Used by computeDeadlinePill.
      noticeSentDate: string | null;
    };

const TONE_CLASS = {
  default: "text-foreground",
  ok: "text-[var(--ok)]",
  warn: "text-[var(--warn)]",
  danger: "text-[var(--danger)]",
  brand: "text-[var(--brand)]",
} as const;

// "OCT 8 · THU" — UTC throughout to keep date-only ISO strings stable across
// timezones. Mirrors `formatCellDate` in components/lease/decision-deadline-tracker.tsx.
function formatRowDate(iso: string): string {
  const d = new Date(iso + "T00:00:00.000Z");
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase();
  const day = d.toLocaleString("en-US", { day: "2-digit", timeZone: "UTC" });
  const weekday = d.toLocaleString("en-US", { weekday: "short", timeZone: "UTC" }).toUpperCase();
  return `${month} ${day} · ${weekday}`;
}

// Map pill tone to one of the AtAGlance row tone classes for the count cell.
// `info` and `coral` are not in the standard row tone set, so they fall through
// to a brand-tinted text class.
const PILL_TONE_TO_TEXT: Record<PillTone, string> = {
  info: "text-foreground",
  warn: "text-[var(--warn)]",
  coral: "text-[var(--brand-secondary)]",
  danger: "text-[var(--danger)]",
  ok: "text-[var(--ok)]",
};

export async function AtAGlance({
  readiness,
  risk,
  lease = null,
  budget = null,
}: AtAGlanceProps) {
  // Live countdown (server-side) from the active relocation — surfaces in the
  // Move day row's sub label, using the shared vocabulary (lib/dates) so it
  // reads "Moved 3 days ago" after the move, never "+3d".
  const { moveDate: moveDateIso } = await getActiveMoveContext();
  const days = daysUntilIso(moveDateIso);
  const phrase = countdownPhrase(days);
  const moveDaySub = moveDateIso
    ? [phrase.lead, phrase.count, phrase.trail].filter((p) => p !== null && p !== "").join(" ")
    : "— —";
  const moveDayTone = countdownTone(days);

  // Row 2: lease-aware cell when a lease exists, otherwise the original Risks row.
  const leaseRow = lease?.exists ? buildLeaseRow(lease) : null;

  type Row = {
    icon: LucideIcon;
    label: string;
    value: string;
    sub?: string;
    tone: keyof typeof TONE_CLASS;
    valueClassOverride?: string; // pill-tone override for the day-count cell
    href?: string; // when set, the row wraps in an <a>
  };

  const ROWS: Row[] = [
    // Budget renders only when a real estimate exists — no fake instruments.
    ...(budget
      ? [
          {
            icon: Wallet,
            label: "Budget",
            value: budget.value,
            sub: budget.sub,
            tone: "default" as const,
            href: "/moving-cost",
          },
        ]
      : []),
    leaseRow ?? {
      icon: ShieldAlert,
      label: "Risks",
      value: risk.riskPosture,
      tone: risk.riskTone as keyof typeof TONE_CLASS,
    },
    {
      icon: Flag,
      label: "Move day",
      value: moveDateIso
        ? new Date(`${moveDateIso}T00:00:00`).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        : "Set in status row",
      sub: moveDaySub,
      tone: moveDayTone,
    },
  ];

  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-card p-4">
      <header className="flex items-baseline justify-between">
        <h2 className="label-cap text-[10px] text-muted-foreground">
          At a Glance
        </h2>
      </header>

      <ul className="mt-4 space-y-3">
        {/* Row 1: multi-source readiness — replaces the v1 T-MINUS row. */}
        <li>
          <div className="border-b border-border/60 pb-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <ListChecks className="size-3.5" strokeWidth={1.75} />
                <span>Readiness</span>
              </span>
              <span className="mono-num text-sm font-medium text-foreground">
                {readiness.completed}/{readiness.total} done
              </span>
            </div>
            <ReadinessBar readiness={readiness} />
          </div>
        </li>

        {ROWS.map((row, idx) => {
          const Icon = row.icon;
          const valueClass = row.valueClassOverride ?? TONE_CLASS[row.tone];
          const isLast = idx === ROWS.length - 1;
          const inner = (
            <div
              className={`flex items-start justify-between gap-3 ${isLast ? "" : "border-b border-border/60 pb-3"}`}
            >
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon className="size-3.5" strokeWidth={1.75} />
                <span>{row.label}</span>
              </span>
              <span className="text-right">
                <span className={`mono-num block text-sm font-medium ${valueClass}`}>
                  {row.value}
                </span>
                {row.sub && (
                  <span className="label-cap mt-0.5 block text-[9px] text-muted-foreground">
                    {row.sub}
                  </span>
                )}
              </span>
            </div>
          );
          return (
            <li key={row.label}>
              {row.href ? (
                <a
                  href={row.href}
                  className="block transition-colors hover:bg-[oklch(var(--muted-raw)/0.3)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
                >
                  {inner}
                </a>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Hairline-segmented progress bar — one segment per active category, width
// proportional to its total weight. Each segment fills left-to-right to its
// own completed/total ratio with a tone-coded fill (ok / warn / danger /
// neutral) per design doc §8.
function ReadinessBar({ readiness }: { readiness: MoveReadiness }) {
  const segments = [
    { key: "checklist", label: "Checklist", ...readiness.byCategory.checklist },
    { key: "lease",     label: "Lease",     ...readiness.byCategory.lease     },
    { key: "utility",   label: "Utilities", ...readiness.byCategory.utility   },
    { key: "address",   label: "Addresses", ...readiness.byCategory.address   },
    {
      key: "deposit",
      label: "Move-out",
      total: readiness.byCategory.deposit.walkthroughStarted ? 1 : 0,
      completed: readiness.byCategory.deposit.pdfGenerated ? 1 : 0,
    },
  ].filter((s) => s.total > 0);

  if (segments.length === 0) {
    return (
      <div className="mt-2 h-1.5 w-full rounded-[var(--radius-sm)] bg-muted/40" />
    );
  }

  const totalWeight = segments.reduce((sum, s) => sum + s.total, 0);
  const fillToneClass = {
    ok:      "bg-[var(--ok)]",
    warn:    "bg-[var(--warn)]",
    danger:  "bg-[var(--danger)]",
    neutral: "bg-muted-foreground/30",
  } as const;

  return (
    <div
      role="progressbar"
      aria-valuenow={readiness.completed}
      aria-valuemin={0}
      aria-valuemax={readiness.total}
      aria-label={`Move readiness: ${readiness.completed} of ${readiness.total} actions complete`}
      className="mt-2 flex h-1.5 w-full gap-px overflow-hidden rounded-[var(--radius-sm)]"
    >
      {segments.map((seg) => {
        const widthPct = (seg.total / totalWeight) * 100;
        const fillPct = seg.total === 0 ? 0 : (seg.completed / seg.total) * 100;
        const tone: keyof typeof fillToneClass =
          fillPct >= 100 ? "ok"
          : fillPct >= 50 ? "warn"
          : fillPct > 0   ? "danger"
          : "neutral";
        return (
          <div
            key={seg.key}
            title={`${seg.label}: ${seg.completed}/${seg.total}`}
            style={{ width: `${widthPct}%` }}
            className="relative bg-muted/40"
          >
            <div
              style={{ width: `${fillPct}%` }}
              className={`absolute inset-y-0 left-0 ${fillToneClass[tone]}`}
            />
          </div>
        );
      })}
    </div>
  );
}

// Compose the lease row from a `LeaseGlance`. Returns the `Row` shape AtAGlance
// already renders; the value cell carries pill-tone color via `valueClassOverride`.
function buildLeaseRow(
  lease: Extract<LeaseGlance, { exists: true }>,
): {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  tone: keyof typeof TONE_CLASS;
  valueClassOverride?: string;
  href?: string;
} {
  const isDepositMode = lease.mode === "deposit-window";
  const label = isDepositMode ? "DEPOSIT WINDOW" : "LEASE NOTICE";
  const icon: LucideIcon = isDepositMode ? Wallet2 : FileText;

  // Sent state only applies to lease-notice mode.
  if (!isDepositMode && lease.noticeSent) {
    return {
      icon,
      label,
      value: "SENT",
      sub: lease.dateIso ? formatRowDate(lease.dateIso) : undefined,
      tone: "ok",
      href: "/lease?tab=notice",
    };
  }

  // Renew state in lease-notice mode: notice send-by date is moot. Show
  // RENEWED instead of a countdown to a deadline that no longer applies.
  if (!isDepositMode && lease.decision === "renew") {
    return {
      icon,
      label,
      value: "RENEWED",
      sub: lease.dateIso ? formatRowDate(lease.dateIso) : undefined,
      tone: "ok",
      href: "/lease?tab=notice",
    };
  }

  const days = lease.daysUntil;
  let valueText = "—";
  if (days !== null) {
    if (days > 0) valueText = `T-${days} days`;
    else if (days === 0) valueText = "TODAY";
    else valueText = `+${Math.abs(days)}d`;
  }

  // Day-count tone: reuse the deadline-pill calculator. In deposit-window mode
  // we synthesize a !noticeSent context — the threshold ladder still applies
  // (info > 14d, warn ≤ 14d, coral ≤ 7d, danger ≤ 2d).
  const pill = isDepositMode
    ? computeDeadlinePill(days, false, null, null)
    : computeDeadlinePill(days, lease.noticeSent, lease.noticeSentDate, lease.decision);

  return {
    icon,
    label,
    value: valueText,
    sub: lease.dateIso ? formatRowDate(lease.dateIso) : undefined,
    tone: "default",
    valueClassOverride: PILL_TONE_TO_TEXT[pill.tone],
    href: "/lease#decision",
  };
}
