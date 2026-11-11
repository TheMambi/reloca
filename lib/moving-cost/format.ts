// USD currency formatter — AD-006 lock (Intl.NumberFormat, no i18n lib).
// Whole dollars; no fractional cents in the estimator UI.
const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatCurrency(n: number): string {
  return USD.format(Number.isFinite(n) ? n : 0);
}
