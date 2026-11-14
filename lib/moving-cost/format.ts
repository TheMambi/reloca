import { usdFormat } from "@/lib/currency";

// Whole dollars; no fractional cents in the estimator UI.
export function formatCurrency(n: number): string {
  // A value that is not a number shows as missing, never as $0.
  if (!Number.isFinite(n)) return "—";
  // Adding 0 turns the -0 that rounding a small negative gives into 0.
  return usdFormat.format(Math.round(n) + 0);
}
