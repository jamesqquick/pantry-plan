/** Money helpers for USD ingredient cost estimates.
 *
 * The app stores money internally as integer cents.
 */

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function formatDollars(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function centsToDollarsInput(cents: number): string {
  const fixed = (cents / 100).toFixed(2);
  // Keep the input tidy (e.g. 2.00 -> "2", 1.20 -> "1.2").
  return fixed.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}
