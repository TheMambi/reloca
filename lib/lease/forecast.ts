// Pure forecasting helper for the lease Penalty & Budget Forecaster (design §4.1).
//
// Given a snapshot of lease terms + a target move-out date + "today", compute
// up to five cost scenarios that the Recharts component (Task 6.14) will render
// as horizontal bars.
//
// This module is intentionally dependency-free: no DB access, no Recharts, no
// date-fns. Same input → same output. The component is responsible for sorting,
// highlighting the "active" path, and formatting currency.

// `LeaseTerms` is imported as a type to anchor field shapes to the Zod schema.
// The function itself takes a narrower `ForecastInput` so callers can pass
// derived values (e.g. a target_move_out_date that has been defaulted from
// lease_end_date).
import type { LeaseTerms } from "@/schemas/lease";

// Re-export for downstream consumers that want to thread a LeaseTerms snapshot
// through without re-importing the schema module.
export type { LeaseTerms };

export type ForecastBarKey =
  | "stay_renew"
  | "vacate_on_time"
  | "m2m_1mo"
  | "m2m_2mo"
  | "m2m_indefinite";

export type ForecastBarColor = "info" | "ok" | "warn" | "danger";

export type ForecastBar = {
  key: ForecastBarKey;
  label: string;
  monthly: number;
  total: number;
  /** Positive = costs more than vacate-on-time; negative = costs less. */
  deltaVsCurrentPath: number;
  color: ForecastBarColor;
  /** True for scenarios where cost continues to accrue beyond the horizon. */
  ongoing?: boolean;
};

export type ForecastInput = {
  current_monthly_rent: number;
  /** Null when the landlord has not extended a renewal offer. */
  renewal_monthly_rent: number | null;
  m2m_premium: number;
  /** ISO date (yyyy-mm-dd). */
  lease_end_date: string;
  /**
   * ISO date. Caller defaults to lease_end_date when LeaseTerms.target_move_out_date is null.
   * Months past lease_end_date are priced at the month-to-month rate.
   */
  target_move_out_date: string;
  /** ISO date. Passed in (rather than read from `new Date()`) for testability. */
  today: string;
};

// User-facing copy rule: no "M2M", no raw "vacate" — these labels render in
// the chart, the scenario table, and the mobile list verbatim.
const LABELS: Record<ForecastBarKey, string> = {
  stay_renew: "Stay (renew 12 months)",
  vacate_on_time: "Notice on time → move out",
  m2m_1mo: "Late notice → 1 month at month-to-month",
  m2m_2mo: "Late notice → 2 months at month-to-month",
  m2m_indefinite: "No notice → month-to-month indefinitely",
};

/**
 * Calendar-aware whole-month count from `from` to `to`. Negative when `to` is
 * before `from`. Example: Aug 5 → Oct 20 returns 2,
 * because Aug 5 + 2 months = Oct 5 ≤ Oct 20.
 */
export function monthsBetween(from: string, to: string): number {
  const f = new Date(from);
  const t = new Date(to);
  return (
    (t.getFullYear() - f.getFullYear()) * 12 +
    (t.getMonth() - f.getMonth()) +
    (t.getDate() >= f.getDate() ? 0 : -1)
  );
}

/** Months after lease end that every bar is priced through. */
export const FORECAST_MONTHS_AFTER_LEASE_END = 12;

const plural = (n: number) => (n === 1 ? "month" : "months");

/**
 * Build the Penalty & Budget Forecaster bars. Returns up to five scenarios in a
 * fixed source order; the component decides sort/highlight. The `stay_renew`
 * bar is omitted when no renewal offer is on the table.
 *
 * Every total covers the same span, today to FORECAST_MONTHS_AFTER_LEASE_END
 * months after lease end, so the bars can be ranked against each other. A
 * target move-out date after lease end prices the months between the two at
 * the month-to-month rate.
 */
export function computeForecast(input: ForecastInput): ForecastBar[] {
  const horizon = FORECAST_MONTHS_AFTER_LEASE_END;
  const monthsRemaining = Math.max(
    0,
    monthsBetween(input.today, input.lease_end_date),
  );
  const m2mRate = input.current_monthly_rent + input.m2m_premium;
  const throughLeaseEnd = input.current_monthly_rent * monthsRemaining;

  // Planned months past lease end. Capped at the horizon so no path can cost
  // more than staying month-to-month for all of it.
  const holdover = Math.min(
    horizon,
    Math.max(0, monthsBetween(input.lease_end_date, input.target_move_out_date)),
  );
  const lateBy = (extra: number) => Math.min(horizon, holdover + extra);

  const vacateOnTimeTotal = throughLeaseEnd + m2mRate * holdover;

  const bars: ForecastBar[] = [];

  // 1. Stay & renew — only if an offer exists.
  if (input.renewal_monthly_rent !== null) {
    bars.push({
      key: "stay_renew",
      label: LABELS.stay_renew,
      monthly: input.renewal_monthly_rent,
      total: throughLeaseEnd + input.renewal_monthly_rent * horizon,
      deltaVsCurrentPath: 0, // filled in below
      color: "info",
    });
  }

  // 2. Vacate on time — reference path for delta.
  bars.push({
    key: "vacate_on_time",
    label:
      holdover > 0
        ? `Notice on time → move out ${holdover} ${plural(holdover)} after lease end`
        : LABELS.vacate_on_time,
    monthly: input.current_monthly_rent,
    total: vacateOnTimeTotal,
    deltaVsCurrentPath: 0,
    color: "ok",
  });

  // 3. Late notice → 1 month of M2M beyond the plan.
  bars.push({
    key: "m2m_1mo",
    label: holdover > 0 ? "Late notice → 1 extra month at month-to-month" : LABELS.m2m_1mo,
    monthly: m2mRate,
    total: throughLeaseEnd + m2mRate * lateBy(1),
    deltaVsCurrentPath: 0,
    color: "warn",
  });

  // 4. Late notice → 2 months of M2M beyond the plan.
  bars.push({
    key: "m2m_2mo",
    label: holdover > 0 ? "Late notice → 2 extra months at month-to-month" : LABELS.m2m_2mo,
    monthly: m2mRate,
    total: throughLeaseEnd + m2mRate * lateBy(2),
    deltaVsCurrentPath: 0,
    color: "warn",
  });

  // 5. No notice → M2M for the whole span after lease end (worst case).
  bars.push({
    key: "m2m_indefinite",
    label: LABELS.m2m_indefinite,
    monthly: m2mRate,
    total: throughLeaseEnd + m2mRate * horizon,
    deltaVsCurrentPath: 0,
    color: "danger",
    ongoing: true,
  });

  // Backfill deltas relative to the vacate-on-time path.
  const reference = bars.find((b) => b.key === "vacate_on_time");
  const referenceTotal = reference ? reference.total : 0;
  for (const bar of bars) {
    bar.deltaVsCurrentPath = bar.total - referenceTotal;
  }

  return bars;
}
