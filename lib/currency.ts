// Whole US dollars, the one money format on screen ("$1,234").
export const usdFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function usd(n: number): string {
  return usdFormat.format(n);
}
