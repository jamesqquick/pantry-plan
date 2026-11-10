/** Money helpers for USD amounts.
 *
 * The app stores money internally as integer cents.
 */

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function dollarsInputToCents(value: string): number | null {
  const match = /^(\d*)(?:\.(\d{0,2}))?$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;

  const cents = Number(`${match[1]}${(match[2] ?? "").padEnd(2, "0")}`);
  return Number.isSafeInteger(cents) ? cents : null;
}

export function formatDollars(cents: number): string {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });
  if (!Number.isSafeInteger(cents)) return formatter.format(cents / 100);

  const fraction = String(Math.abs(cents % 100)).padStart(2, "0");
  return formatter.formatToParts(Math.trunc(cents / 100))
    .map((part) => part.type === "fraction" ? fraction : part.value)
    .join("");
}

export function centsToDollarsInput(cents: number): string {
  const fixed = Number.isSafeInteger(cents)
    ? `${cents < 0 ? "-" : ""}${Math.trunc(Math.abs(cents) / 100)}.${String(Math.abs(cents % 100)).padStart(2, "0")}`
    : (cents / 100).toFixed(2);
  // Keep the input tidy (e.g. 2.00 -> "2", 1.20 -> "1.2").
  return fixed.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
}
