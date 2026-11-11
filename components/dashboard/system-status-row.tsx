// The "System Status" developer-scaffolding row was retired in Wave D (D.3) in
// favour of <DataSourcesPanel>. This file carries the warm companion card that
// sits beside it — since Wave 1 (AD-039) it reflects the real alert state
// instead of unconditionally claiming "You're on track".

export function AllSystemsGo({
  alertCount,
  arrived,
}: {
  /** Live count from getStatusAlerts() — 0 means genuinely on track. */
  alertCount: number;
  /** True once the active move's date has passed. */
  arrived: boolean;
}) {
  let title: string;
  let body: string;
  if (alertCount > 0) {
    title = "Almost there";
    body =
      alertCount === 1
        ? "One thing still needs a look — check the alert at the top of the page."
        : `${alertCount} things still need a look — check the alerts at the top of the page.`;
  } else if (arrived) {
    title = "You made it";
    body = "The move is behind you. Wrap up the last details at your own pace.";
  } else {
    title = "You're on track";
    body = "Everything's lined up for a smooth move.";
  }

  return (
    // No atmosphere here: AD-005 allows exactly two (hero + journey active
    // phase); this card's coral radial was a third (removed Wave 4, AD-042).
    <section className="relative overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card p-4">
      <div className="relative flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--brand-secondary)]/15">
          <Sparkle className="size-5 text-[var(--brand-secondary)]" />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
        </div>
      </div>
    </section>
  );
}

function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M12 2 L13.6 9.4 L21 11 L13.6 12.6 L12 20 L10.4 12.6 L3 11 L10.4 9.4 Z" />
    </svg>
  );
}
