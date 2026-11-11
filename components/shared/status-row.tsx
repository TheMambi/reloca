import Link from "next/link";
import { Bell, Circle } from "lucide-react";
import { MoveDateEditor } from "@/components/shared/move-date-editor";
import { MobileNavDrawer } from "@/components/shared/mobile-nav-drawer";
import { getLeaseStatus } from "@/lib/data/lease-db";
import { getStatusAlerts } from "@/lib/data/status-alerts";
import {
  getActiveMoveContext,
  getRelocations,
  toRelocationOption,
} from "@/lib/data/relocation-db";
import { getCities } from "@/lib/data/cities";
import { RelocationSwitcher } from "@/components/shared/relocation-switcher";
import { computeDeadlinePill, PILL_TONE_CLASSES } from "@/lib/lease/pill";

export async function StatusRow() {
  // Single indexed lookup against `lease_terms` (+ events). Adds one DB roundtrip
  // per page load; keeps the global pill in sync with the /lease tracker without
  // duplicating computeDeadlinePill logic.
  const [leaseStatus, alerts, moveContext, relocations] = await Promise.all([
    getLeaseStatus(),
    getStatusAlerts(),
    getActiveMoveContext(),
    getRelocations(),
  ]);

  const relocationOptions = relocations.map(toRelocationOption);
  const activeRelocation = relocations.find((r) => r.is_active_move) ?? null;
  const activeId = relocationOptions.find((o) => o.isActive)?.id ?? null;
  const cityChoices = getCities().map((c) => ({
    slug: c.slug,
    displayName: c.displayName,
  }));

  // Show the deadline pill only while a decision is pending — once `notice_sent`
  // is recorded, /lease takes over the success state. Renew gets its own variant
  // (label-only, no countdown).
  const showLeasePill =
    leaseStatus.exists && !leaseStatus.noticeSent;
  const isRenewed = leaseStatus.decision === "renew";

  const pill = showLeasePill
    ? computeDeadlinePill(
        leaseStatus.daysUntilSendBy,
        leaseStatus.noticeSent,
        null,
        leaseStatus.decision,
      )
    : null;

  // T-Nd countdown: positive → "T-11d", zero → "T-0d", negative → "T+3d" past-due.
  const tMinusLabel = formatLeaseTMinus(leaseStatus.daysUntilSendBy);

  return (
    <header
      role="banner"
      className="flex h-12 items-center gap-2 border-b border-border bg-background/95 px-4 text-xs text-muted-foreground sm:gap-6"
    >
      <MobileNavDrawer />

      {/* ONLINE pip is desktop chrome — hidden at small widths so the row's
          high-value items (relocation switcher, move countdown, alerts) fit
          without horizontal overflow (Wave F, F.2). */}
      <span className="hidden items-center gap-2 sm:flex">
        <Circle className="size-2 fill-[var(--ok)] text-[var(--ok)]" />
        <span className="label-cap text-[10px] text-foreground">ONLINE</span>
      </span>

      <RelocationSwitcher
        options={relocationOptions}
        activeId={activeId}
        cities={cityChoices}
      />

      <MoveDateEditor
        initialMoveDate={moveContext.moveDate}
        createdAt={activeRelocation?.created_at ?? null}
      />

      {showLeasePill && pill && (
        <Link
          href="/lease"
          aria-label="Lease decision deadline"
          className="hidden items-center gap-2 hover:text-foreground sm:flex"
        >
          <span className="label-cap text-[10px]">LEASE</span>
          {isRenewed ? null : (
            <span className="mono-num text-[10px] text-foreground tabular-nums">
              {tMinusLabel}
            </span>
          )}
          <span
            className={`label-cap inline-flex items-center rounded-[var(--radius-sm)] border px-1.5 py-0.5 text-[9px] tracking-wider ${PILL_TONE_CLASSES[pill.tone]}`}
          >
            {pill.label}
          </span>
        </Link>
      )}

      <div className="ml-auto flex items-center gap-2 sm:gap-4" role="toolbar" aria-label="Status actions">
        {/* Mobile-only compact alert affordance — the full pills (some are
            wide, e.g. a cost-delta string) won't fit at 375, so collapse them
            to a tone-coded count that links to the top alert. Full pills show
            at sm+ (Wave F, F.2). */}
        {alerts.length > 0 && (
          <Link
            href={alerts[0].href}
            aria-label={`${alerts.length} status ${alerts.length === 1 ? "alert" : "alerts"}`}
            className={`flex items-center gap-1 rounded-[var(--radius-sm)] border px-1.5 py-0.5 text-[10px] sm:hidden ${PILL_TONE_CLASSES[alerts[0].tone]}`}
          >
            <Bell className="size-3" strokeWidth={1.75} />
            <span className="mono-num">{alerts.length}</span>
          </Link>
        )}

        {alerts.length > 0 && (
          <ul
            aria-label="Status alerts"
            className="hidden items-center gap-2 sm:flex"
          >
            {alerts.map((alert) => (
              <li key={alert.id}>
                <Link
                  href={alert.href}
                  className={`label-cap inline-flex items-center rounded-[var(--radius-sm)] border px-2 py-0.5 text-[10px] tracking-wider transition-opacity hover:opacity-80 ${PILL_TONE_CLASSES[alert.tone]}`}
                >
                  {alert.label}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <ProfileChip />
      </div>
    </header>
  );
}

/* User profile chip — avatar with a status dot in the corner + name. The
   status dot communicates "online / all systems operational" visually; the
   `title` attribute carries the full status string for hover and a11y. */
function ProfileChip() {
  return (
    <div
      title="Household profile"
      className="hidden items-center gap-2 rounded-[var(--radius-md)] border border-border/70 bg-card/40 py-1 pl-1 pr-2.5 sm:flex"
    >
      <span className="relative grid size-6 shrink-0 place-items-center rounded-full bg-[var(--info)]/15 text-[10px] font-semibold text-[var(--info)]">
        H
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-[var(--ok)] ring-2 ring-background"
        />
      </span>
      <span className="text-xs font-medium text-foreground">Household</span>
      <span className="sr-only">Household profile</span>
    </div>
  );
}

// "T-11d" / "T-0d" / "T+3d" — short countdown for the inline status pill cell.
function formatLeaseTMinus(days: number | null): string {
  if (days === null) return "T-—";
  if (days === 0) return "T-0d";
  if (days > 0) return `T-${days}d`;
  return "Overdue";
}
