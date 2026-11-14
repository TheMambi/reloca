// USD currency formatter — AD-006 lock (Intl.NumberFormat, no i18n lib).
// Whole dollars; no fractional cents in the estimator UI.
const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatCurrency(n: number): string {
  // A value that is not a number shows as missing, never as $0.
  if (!Number.isFinite(n)) return "—";
  // Adding 0 turns the -0 that rounding a small negative gives into 0.
  return USD.format(Math.round(n) + 0);
}
