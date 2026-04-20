/**
 * Client-safe fraction/quantity parsing. No server-only imports.
 */

const UNICODE_FRACTIONS: { char: string; replacement: string }[] = [
  { char: "¼", replacement: "1/4" },
  { char: "½", replacement: "1/2" },
  { char: "¾", replacement: "3/4" },
  { char: "⅓", replacement: "1/3" },
  { char: "⅔", replacement: "2/3" },
  { char: "⅛", replacement: "1/8" },
  { char: "⅜", replacement: "3/8" },
  { char: "⅝", replacement: "5/8" },
  { char: "⅞", replacement: "7/8" },
];

/**
 * Normalize fraction-related text for parsing.
 * - Trim and collapse whitespace
 * - Replace unicode fraction chars with ASCII (e.g. ½ → "1/2")
 * - Replace hyphen-mixed numbers: "1-1/2" → "1 1/2"
 */
export function normalizeFractionText(input: string): string {
  let s = input.trim().replace(/\s+/g, " ");
  for (const { char, replacement } of UNICODE_FRACTIONS) {
    s = s.split(char).join(replacement);
  }
  s = s.replace(/(\d)-(\d\s*\/\s*\d)/g, "$1 $2");
  return s;
}

/**
 * Parse a quantity string to a number.
 * Uses normalizeFractionText first. Accepts: integer, decimal, fraction, mixed number.
 * Rejects: empty, invalid, NaN, Infinity, denominator 0, negative.
 */
export function parseQuantityText(input: string): number | null {
  const s = normalizeFractionText(input);
  if (s === "") return null;
  if (s.startsWith("-")) return null;

  // Mixed number: "1 1/2" or "2 3/4"
  const mixedMatch = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1], 10);
    const num = parseInt(mixedMatch[2], 10);
    const den = parseInt(mixedMatch[3], 10);
    if (den === 0 || Number.isNaN(whole) || Number.isNaN(num) || Number.isNaN(den)) return null;
    const value = whole + num / den;
    return value > 0 && Number.isFinite(value) ? value : null;
  }

  // Simple fraction: "1/3" or "1/2"
  const fracMatch = /^(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (fracMatch) {
    const num = parseInt(fracMatch[1], 10);
    const den = parseInt(fracMatch[2], 10);
    if (den === 0 || Number.isNaN(num) || Number.isNaN(den)) return null;
    const value = num / den;
    return value > 0 && Number.isFinite(value) ? value : null;
  }

  // Integer or decimal (reject trailing junk)
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = parseFloat(s);
  if (Number.isNaN(n) || !Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Returns true if input is empty or parses to a valid positive quantity.
 */
export function isValidQuantityText(input: string): boolean {
  const s = input.trim();
  if (s === "") return true;
  return parseQuantityText(s) !== null;
}

function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

/**
 * Format a decimal quantity as a fraction string for display (e.g. 0.5 → "1/2", 1.25 → "1 1/4").
 * Rounds to nearest 1/12 so we get common cooking fractions: halves, thirds, quarters.
 */
export function formatQuantityAsFraction(qty: number): string {
  if (!Number.isFinite(qty) || qty < 0) return String(qty);
  if (qty === 0) return "0";
  const rounded = Math.round(qty * 12) / 12;
  const whole = Math.floor(rounded);
  const fracPart = rounded - whole;
  const eps = 1e-9;
  if (fracPart < eps) return String(whole);
  let num = Math.round(fracPart * 12);
  let den = 12;
  const g = gcd(num, den);
  num /= g;
  den /= g;
  const frac = `${num}/${den}`;
  return whole > 0 ? `${whole} ${frac}` : frac;
}
