/**
 * Single numeric quantity: parse from text, format as fraction for display.
 * Client-safe; no server-only imports.
 */

const UNICODE_TO_ASCII: { char: string; replacement: string }[] = [
  { char: "½", replacement: "1/2" },
  { char: "¼", replacement: "1/4" },
  { char: "¾", replacement: "3/4" },
  { char: "⅓", replacement: "1/3" },
  { char: "⅔", replacement: "2/3" },
  { char: "⅛", replacement: "1/8" },
  { char: "⅜", replacement: "3/8" },
  { char: "⅝", replacement: "5/8" },
  { char: "⅞", replacement: "7/8" },
];

function normalizeForParse(input: string): string {
  let s = input.trim().replace(/\s+/g, " ");
  for (const { char, replacement } of UNICODE_TO_ASCII) {
    s = s.split(char).join(replacement);
  }
  s = s.replace(/(\d)-(\d\s*\/\s*\d)/g, "$1 $2");
  return s.replace(/[^\d\s./]/g, "").trim().replace(/\s+/g, " ");
}

/**
 * Parse a quantity string into a number.
 * Supports: "2", "2.25", "1/3", "1 1/2", "1-1/2", unicode ½ ¼ ¾ ⅓ ⅔ ⅛ ⅜ ⅝ ⅞.
 * Returns null for empty, negative, denominator 0, NaN, or Infinity.
 */
export function parseQuantityText(input: string): number | null {
  if (input.trim().startsWith("-")) return null;
  const s = normalizeForParse(input);
  if (s === "") return null;

  // Mixed: "1 1/2" or "2 3/4"
  const mixedMatch = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1], 10);
    const num = parseInt(mixedMatch[2], 10);
    const den = parseInt(mixedMatch[3], 10);
    if (den === 0 || Number.isNaN(whole) || Number.isNaN(num) || Number.isNaN(den)) return null;
    const value = whole + num / den;
    if (value < 0 || !Number.isFinite(value)) return null;
    return Math.round(value * 1e6) / 1e6;
  }

  // Fraction only: "1/3" or "1/2"
  const fracMatch = /^(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (fracMatch) {
    const num = parseInt(fracMatch[1], 10);
    const den = parseInt(fracMatch[2], 10);
    if (den === 0 || Number.isNaN(num) || Number.isNaN(den)) return null;
    const value = num / den;
    if (value <= 0 || !Number.isFinite(value)) return null;
    return Math.round(value * 1e6) / 1e6;
  }

  // Integer or decimal
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = parseFloat(s);
  if (Number.isNaN(n) || !Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 1e6) / 1e6;
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

/** Find best rational approximation with denominator <= maxDenom (Stern–Brocot style). */
function toRational(x: number, maxDenom: number): { num: number; den: number } {
  const eps = 0.0001;
  if (x <= 0 || !Number.isFinite(x)) return { num: 0, den: 1 };
  const whole = Math.floor(x);
  const frac = x - whole;
  if (frac < eps) return { num: whole, den: 1 };
  if (frac > 1 - eps) return { num: whole + 1, den: 1 };

  let bestNum = 0;
  let bestDen = 1;
  let bestDiff = 1;

  for (let den = 1; den <= maxDenom; den++) {
    const num = Math.round(frac * den);
    const value = whole + num / den;
    const diff = Math.abs(value - x);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestNum = whole * den + num;
      bestDen = den;
    }
  }

  const g = gcd(bestNum, bestDen);
  return { num: bestNum / g, den: bestDen / g };
}

const INTEGER_EPSILON = 0.0001;

/**
 * Format a numeric quantity as a mixed fraction string for display.
 * Default maxDenominator = 16. Never displays decimals in UI.
 */
export function formatQuantity(
  value: number,
  opts?: { maxDenominator?: number }
): string {
  const maxDenom = opts?.maxDenominator ?? 16;
  if (!Number.isFinite(value) || value < 0) return "";
  if (value < INTEGER_EPSILON) return "0";

  const rounded = Math.round(value * 1e6) / 1e6;
  if (Math.abs(rounded - Math.round(rounded)) < INTEGER_EPSILON) {
    return String(Math.round(rounded));
  }

  const { num, den } = toRational(value, maxDenom);
  const whole = Math.floor(num / den);
  const remainder = num % den;

  if (remainder === 0) return String(whole);
  const fracNum = remainder;
  const fracDen = den;
  if (whole > 0) return `${whole} ${fracNum}/${fracDen}`;
  return `${fracNum}/${fracDen}`;
}

export type NormalizeQuantityResult = {
  normalizedText: string;
  value: number | null;
  isValid: boolean;
};

/**
 * Parse input; if valid, normalizedText = formatQuantity(value); else normalizedText = "" or input for invalid.
 * Returns { normalizedText, value, isValid }.
 */
export function normalizeQuantityText(input: string): NormalizeQuantityResult {
  const trimmed = input.trim();
  if (trimmed === "") {
    return { normalizedText: "", value: null, isValid: true };
  }
  const value = parseQuantityText(trimmed);
  if (value === null) {
    return { normalizedText: trimmed, value: null, isValid: false };
  }
  return {
    normalizedText: formatQuantity(value),
    value,
    isValid: true,
  };
}

const STEP = 0.25;

/**
 * Adjust quantity by step (0.25). direction "down" does not go below 0.
 */
export function adjustQuantity(
  value: number,
  direction: "up" | "down"
): number {
  if (direction === "up") return Math.round((value + STEP) * 1e6) / 1e6;
  const next = Math.round((value - STEP) * 1e6) / 1e6;
  return next < 0 ? 0 : next;
}
