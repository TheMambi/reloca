import type { LeaseTerms } from "@/schemas/lease";
import { computeForecast, type ForecastBar } from "@/lib/lease/forecast";
import { todayInZoneIso } from "@/lib/dates";
import { ForecasterBarChart } from "./forecaster-bar-chart";
import { TargetMoveOutEditor } from "./target-move-out-editor";
// NOTE (AD-044): a next/dynamic split of this chart bought nothing — the RSC
// renders every TabsContent server-side, so recharts lands in the route's
// First Load either way. The real fix is URL-driven single-tab rendering;
// deferred (it changes tab-switching from instant client toggles to
// navigations). react-pdf on this route IS lazy (see move-out-actions).

const fmtCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

interface PenaltyForecasterProps {
  lease: LeaseTerms;
  /** Whether a `notice_sent` event exists. Drives the active-scenario coral
   *  highlight when the user has chosen "vacate". */
  noticeSent: boolean;
  /** True once today is past the (target) move-out date — the forecast is a
   *  settled question, so render a summary instead of degenerate $0 scenarios
   *  (AD-039). */
  pastMoveOut?: boolean;
}

/**
 * Penalty & Budget Forecaster (design §4.1).
 *
 * RSC: math runs server-side via `computeForecast`, then a small client
 * subcomponent (`<ForecasterBarChart>`) renders the Recharts chart and another
 * (`<TargetMoveOutEditor>`) handles the calendar popover. The scenario table
 * and honesty gloss line stay in the RSC.
 */
export function PenaltyForecaster({
  lease,
  noticeSent,
  pastMoveOut = false,
}: PenaltyForecasterProps) {
  const today = todayInZoneIso();
  const target = lease.target_move_out_date ?? lease.lease_end_date;

  // Terminal state: with the move-out behind you, monthsRemaining is 0 and
  // every scenario would degenerate to $0-ish noise. Render the settled
  // summary instead of a forecast for a question that's been answered.
  if (pastMoveOut) {
    return (
      <SettledSummary
        lease={lease}
        noticeSent={noticeSent}
        moveOutIso={target}
      />
    );
  }

  const bars = computeForecast({
    current_monthly_rent: lease.current_monthly_rent,
    renewal_monthly_rent: lease.renewal_monthly_rent,
    m2m_premium: lease.m2m_premium,
    lease_end_date: lease.lease_end_date,
    target_move_out_date: target,
    today,
  });

  const activeKey = computeActiveScenarioKey(lease.decision, noticeSent);
  const sortedBars = [...bars].sort((a, b) => a.total - b.total);

  // Honesty gloss: only render when renewing actually beats vacate-on-time on
  // total cost AND the user hasn't already locked in `renew` (no nudge needed
  // once they've decided to stay).
  const stayBar = bars.find((b) => b.key === "stay_renew");
  const showRenewNudge =
    stayBar !== undefined &&
    stayBar.deltaVsCurrentPath < 0 &&
    lease.decision !== "renew";

  return (
    <section
      aria-labelledby="forecaster-heading"
      className="rounded-[var(--radius-md)] border border-border bg-card"
    >
      <header className="border-b border-border px-6 py-4">
        <span
          id="forecaster-heading"
          className="label-cap text-[10px] text-muted-foreground"
        >
          COST OF EACH PATH
        </span>
        <p className="mt-1 text-sm font-medium text-foreground">
          What each option costs at this address, from today to 12 months
          after the lease ends
        </p>
        <p className="text-xs text-muted-foreground">
          Cheapest at the top. The coral-outlined bar is the path you&rsquo;ve
          chosen. Rent at your next home is not included.
        </p>
      </header>

      {/* ── Top region: Recharts horizontal bar chart ───────────────────── */}
      <div className="border-b border-border px-6 py-6">
        <ForecasterBarChart bars={sortedBars} activeKey={activeKey} />
      </div>

      {/* ── Bottom region: editable target + scenario table + nudge ─────── */}
      <div className="px-6 py-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <span className="label-cap text-[10px] text-muted-foreground">
            SCENARIOS
          </span>
          <TargetMoveOutEditor
            leaseId={lease.id}
            current={target}
            leaseStartDate={lease.lease_start_date}
            disabled={noticeSent}
          />
        </div>

        <ScenarioTable bars={bars} activeKey={activeKey} />

        {showRenewNudge && (
          <p className="mt-4 text-xs italic leading-relaxed text-muted-foreground">
            Renewing is{" "}
            <span className="mono-num not-italic text-foreground">
              {fmtCurrency.format(Math.abs(stayBar.deltaVsCurrentPath))}
            </span>{" "}
            cheaper over that period. The case for moving is non-financial — flag
            this trade-off before sending notice.
          </p>
        )}
      </div>
    </section>
  );
}

// ── settled summary (terminal state, AD-039) ─────────────────────────────

const settledDateFmt = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function SettledSummary({
  lease,
  noticeSent,
  moveOutIso,
}: {
  lease: LeaseTerms;
  noticeSent: boolean;
  moveOutIso: string;
}) {
  const moveOutDate = settledDateFmt.format(
    new Date(`${moveOutIso}T00:00:00.000Z`),
  );
  const pathLabel =
    lease.decision === "renew"
      ? "You renewed the lease"
      : noticeSent
        ? "Notice went out on time and you moved out as planned"
        : "You moved out";

  return (
    <section
      aria-labelledby="forecaster-heading"
      className="rounded-[var(--radius-md)] border border-border bg-card"
    >
      <header className="border-b border-border px-6 py-4">
        <span
          id="forecaster-heading"
          className="label-cap text-[10px] text-muted-foreground"
        >
          COST OF EACH PATH
        </span>
        <p className="mt-1 text-sm font-medium text-foreground">
          This one&rsquo;s settled
        </p>
      </header>
      <div className="px-6 py-6">
        <p className="text-sm leading-relaxed text-foreground">{pathLabel}.</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Move-out date: {moveOutDate}. Final rent stops with the lease — what&rsquo;s
          left now is the deposit, tracked in the Walkthrough tab.
        </p>
      </div>
    </section>
  );
}

function computeActiveScenarioKey(
  decision: LeaseTerms["decision"],
  noticeSent: boolean,
): ForecastBar["key"] {
  if (decision === "renew") return "stay_renew";
  if (decision === "m2m") return "m2m_indefinite";
  if (decision === "vacate" && noticeSent) return "vacate_on_time";
  // Undecided OR vacate-not-yet-sent: highlight the on-time-vacate reference
  // path. (A "late notice" highlight would require knowing send-by — kept
  // simple per Task 6.14 brief; refinements live in Wave A polish.)
  return "vacate_on_time";
}

// ── scenario table ────────────────────────────────────────────────────────

interface ScenarioTableProps {
  /** In source order — the table preserves the canonical reading order
   *  (renew → vacate → 1mo M2M → 2mo M2M → indefinite M2M), distinct from the
   *  chart's ascending-by-cost sort. */
  bars: ForecastBar[];
  activeKey: ForecastBar["key"];
}

function ScenarioTable({ bars, activeKey }: ScenarioTableProps) {
  return (
    <>
      {/* Desktop: traditional table; preserves alignment of $ columns. */}
      <table className="hidden w-full border-collapse text-sm sm:table">
        <thead>
          <tr className="border-b border-border">
            <th
              scope="col"
              className="label-cap py-2 text-left text-[9px] font-medium text-muted-foreground"
            >
              PATH
            </th>
            <th
              scope="col"
              className="label-cap py-2 pr-4 text-right text-[9px] font-medium text-muted-foreground"
            >
              PER MONTH
            </th>
            <th
              scope="col"
              className="label-cap py-2 pr-4 text-right text-[9px] font-medium text-muted-foreground"
            >
              TOTAL
            </th>
            <th
              scope="col"
              className="label-cap py-2 text-right text-[9px] font-medium text-muted-foreground"
            >
              VS YOUR PATH
            </th>
          </tr>
        </thead>
        <tbody>
          {bars.map((bar) => {
            const isActive = bar.key === activeKey;
            const isReference = bar.key === "vacate_on_time";
            return (
              <tr
                key={bar.key}
                className={`border-b border-border last:border-b-0 ${
                  isActive
                    ? "border-l-2 border-l-[var(--brand-secondary)]"
                    : ""
                }`}
              >
                <td className="py-2.5 text-foreground">
                  <span className={isActive ? "pl-3" : ""}>{bar.label}</span>
                </td>
                <td className="mono-num py-2.5 pr-4 text-right text-foreground">
                  {formatMonthly(bar)}
                </td>
                <td className="mono-num py-2.5 pr-4 text-right text-foreground">
                  {formatTotal(bar)}
                </td>
                <td className="mono-num py-2.5 text-right">
                  {formatDelta(bar, isReference)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Mobile: 2-column key/value list per scenario, hairline-divided. */}
      <ul className="flex flex-col divide-y divide-border sm:hidden">
        {bars.map((bar) => {
          const isActive = bar.key === activeKey;
          const isReference = bar.key === "vacate_on_time";
          return (
            <li
              key={bar.key}
              className={`flex flex-col gap-1.5 py-3 ${
                isActive
                  ? "border-l-2 border-l-[var(--brand-secondary)] pl-3"
                  : ""
              }`}
            >
              <p className="text-sm font-medium text-foreground">{bar.label}</p>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="label-cap text-[9px] text-muted-foreground">
                  Per month
                </dt>
                <dd className="mono-num text-right text-foreground">
                  {formatMonthly(bar)}
                </dd>
                <dt className="label-cap text-[9px] text-muted-foreground">
                  Total
                </dt>
                <dd className="mono-num text-right text-foreground">
                  {formatTotal(bar)}
                </dd>
                <dt className="label-cap text-[9px] text-muted-foreground">
                  Vs your path
                </dt>
                <dd className="mono-num text-right">
                  {formatDelta(bar, isReference)}
                </dd>
              </dl>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function formatMonthly(bar: ForecastBar): string {
  // Indefinite M2M: show "/mo" for clarity that the monthly burn keeps going.
  if (bar.ongoing) return `${fmtCurrency.format(bar.monthly)}/mo`;
  return fmtCurrency.format(bar.monthly);
}

function formatTotal(bar: ForecastBar): string {
  return fmtCurrency.format(bar.total);
}

function formatDelta(bar: ForecastBar, isReference: boolean): React.ReactNode {
  if (isReference) {
    return (
      <span className="text-muted-foreground">— current path</span>
    );
  }
  const delta = bar.deltaVsCurrentPath;
  if (delta === 0) {
    return <span className="text-muted-foreground">±$0</span>;
  }
  const sign = delta > 0 ? "+" : "−";
  const tone =
    delta > 0
      ? bar.color === "danger"
        ? "text-[var(--danger)]"
        : "text-[var(--warn)]"
      : "text-[var(--ok)]";
  return (
    <span className={tone}>
      {sign}
      {fmtCurrency.format(Math.abs(delta))}
    </span>
  );
}
