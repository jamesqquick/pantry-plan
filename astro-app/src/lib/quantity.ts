/**
 * Structured quantity model: whole + fraction + decimal.
 * Single source of truth for allowed fractions and parsing/normalization.
 * Client-safe; no server-only imports.
 */

/** Allowed cooking fractions (ordered). Empty string = none. */
export const ALLOWED_FRACTIONS: string[] = [
  "",
  "1/8",
  "1/6",
  "1/5",
  "1/4",
  "1/3",
  "3/8",
  "2/5",
  "1/2",
  "3/5",
  "5/8",
  "2/3",
  "3/4",
  "4/5",
  "5/6",
  "7/8",
];

const FRACTION_TO_DECIMAL: Record<string, number> = Object.fromEntries(
  ALLOWED_FRACTIONS.filter(Boolean).map((f) => {
    const [n, d] = f.split("/").map(Number);
    return [f, n / d];
  })
);

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

/** Tolerance for matching decimal to allowed fraction. */
const FRACTION_TOLERANCE = 0.02;

/** Round decimal to 4 decimals (avoids floating point noise). */
function roundDecimal(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/** Round to 4 decimals; public API for callers. */
export function safeRoundDecimal(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/**
 * Normalize raw quantity input for parsing.
 * - Trim and collapse spaces
 * - Unicode fractions -> ASCII (½ -> 1/2)
 * - "1½" -> "1 1/2"
 * - Keep only digits, space, slash, dot
 */
export function normalizeQuantityInput(input: string): string {
  let s = input.trim().replace(/\s+/g, " ");
  for (const { char, replacement } of UNICODE_TO_ASCII) {
    s = s.split(char).join(replacement);
  }
  // Mixed number without space: "1½" -> "1 1/2"
  s = s.replace(/(\d)(\d\s*\/\s*\d)/g, "$1 $2");
  s = s.replace(/(\d)-(\d\s*\/\s*\d)/g, "$1 $2");
  s = s.replace(/\s+/g, " ").trim();
  return s.replace(/[^\d\s./]/g, "").trim().replace(/\s+/g, " ");
}

export type ParsedQuantity = {
  whole: number | null;
  fraction: string | null;
  decimal: number | null;
  isValid: boolean;
};

/**
 * Parse a quantity string into whole, fraction, and decimal.
 * Invalid input returns all nulls. Decimals are converted to nearest allowed fraction.
 */
export function parseQuantity(input: string): ParsedQuantity {
  const invalid = (): ParsedQuantity =>
    ({ whole: null, fraction: null, decimal: null, isValid: false });
  if (input.trim().startsWith("-")) return invalid();
  const s = normalizeQuantityInput(input);
  if (s === "") return invalid();

  // Mixed: "1 1/2" or "0 1/2"
  const mixedMatch = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1], 10);
    const num = parseInt(mixedMatch[2], 10);
    const den = parseInt(mixedMatch[3], 10);
    if (den === 0 || Number.isNaN(whole) || Number.isNaN(num) || Number.isNaN(den)) {
      return invalid();
    }
    const fracVal = num / den;
    const decimal = roundDecimal(whole + fracVal);
    const fraction = decimalToNiceFraction(decimal).fraction;
    const valid = decimal > 0 && Number.isFinite(decimal);
    return {
      whole: whole === 0 ? 0 : whole,
      fraction,
      decimal: valid ? decimal : null,
      isValid: valid,
    };
  }

  // Simple fraction: "1/2" or "1/3"
  const fracMatch = /^(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (fracMatch) {
    const num = parseInt(fracMatch[1], 10);
    const den = parseInt(fracMatch[2], 10);
    if (den === 0 || Number.isNaN(num) || Number.isNaN(den)) {
      return invalid();
    }
    const decimal = roundDecimal(num / den);
    if (decimal <= 0 || !Number.isFinite(decimal)) {
      return invalid();
    }
    const nice = decimalToNiceFraction(decimal);
    return {
      whole: nice.whole === 0 ? null : nice.whole,
      fraction: nice.fraction,
      decimal,
      isValid: true,
    };
  }

  // Integer or decimal: "2" or "1.5"
  if (!/^\d+(\.\d+)?$/.test(s)) return invalid();
  const n = parseFloat(s);
  if (Number.isNaN(n) || !Number.isFinite(n) || n < 0) {
    return invalid();
  }
  const decimal = roundDecimal(n);
  const nice = decimalToNiceFraction(decimal);
  return {
    whole: nice.whole === 0 && nice.fraction ? 0 : nice.whole,
    fraction: nice.fraction,
    decimal,
    isValid: true,
  };
}

export type NiceFraction = {
  whole: number;
  fraction: string | null;
  decimal: number;
};

/**
 * Convert a decimal to nearest allowed fraction (whole + fraction).
 * Never output invalid forms (e.g. fraction that equals 1); carry into whole.
 */
export function decimalToNiceFraction(decimal: number): NiceFraction {
  if (!Number.isFinite(decimal) || decimal < 0) {
    return { whole: 0, fraction: null, decimal: 0 };
  }
  const d = roundDecimal(decimal);
  const whole = Math.floor(d);
  const fracPart = d - whole;

  if (fracPart < 1e-9) {
    return { whole, fraction: null, decimal: d };
  }

  let bestFraction: string | null = null;
  let bestDiff = 1;

  for (const f of ALLOWED_FRACTIONS) {
    if (!f) continue;
    const val = FRACTION_TO_DECIMAL[f];
    const diff = Math.abs(fracPart - val);
    if (diff < bestDiff && diff <= FRACTION_TOLERANCE) {
      bestDiff = diff;
      bestFraction = f;
    }
  }

  if (bestFraction) {
    const fracVal = FRACTION_TO_DECIMAL[bestFraction];
    const total = roundDecimal(whole + fracVal);
    const outWhole = Math.floor(total);
    const outFracPart = total - outWhole;
    if (outFracPart < 1e-9 || outFracPart >= 1 - 1e-9) {
      return { whole: Math.round(total), fraction: null, decimal: roundDecimal(total) };
    }
    return {
      whole: outWhole,
      fraction: bestFraction,
      decimal: total,
    };
  }

  // No matching fraction; if fractional part rounds to 1, carry to whole
  if (fracPart >= 1 - FRACTION_TOLERANCE) {
    return { whole: whole + 1, fraction: null, decimal: roundDecimal(whole + 1) };
  }
  return { whole, fraction: null, decimal: d };
}

/**
 * Compute canonical decimal from whole and fraction (for storage/math).
 */
export function decimalFromWholeAndFraction(
  whole: number | null,
  fraction: string | null
): number | null {
  const w = whole ?? 0;
  const fVal = fraction && FRACTION_TO_DECIMAL[fraction] != null ? FRACTION_TO_DECIMAL[fraction] : 0;
  const d = roundDecimal(w + fVal);
  if (d <= 0 || !Number.isFinite(d)) return null;
  return d;
}

/** Three integers: whole, numerator, denominator. Denominator 0 = no fraction. */
export type QuantityThreeInts = {
  whole: number;
  numerator: number;
  denominator: number;
};

/**
 * Parse a quantity string into whole, numerator, denominator (integers).
 * Invalid input returns null. Denominator 0 or null means no fraction.
 */
export function parseQuantityToThreeInts(input: string): QuantityThreeInts | null {
  if (input.trim().startsWith("-")) return null;
  const s = normalizeQuantityInput(input);
  if (s === "") return null;

  // Mixed: "2 1/2"
  const mixedMatch = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1], 10);
    const num = parseInt(mixedMatch[2], 10);
    const den = parseInt(mixedMatch[3], 10);
    if (den === 0 || Number.isNaN(whole) || Number.isNaN(num) || Number.isNaN(den)) return null;
    const decimal = roundDecimal(whole + num / den);
    if (decimal <= 0 || !Number.isFinite(decimal)) return null;
    return { whole, numerator: num, denominator: den };
  }

  // Fraction only: "1/3"
  const fracMatch = /^(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (fracMatch) {
    const num = parseInt(fracMatch[1], 10);
    const den = parseInt(fracMatch[2], 10);
    if (den === 0 || Number.isNaN(num) || Number.isNaN(den)) return null;
    const decimal = roundDecimal(num / den);
    if (decimal <= 0 || !Number.isFinite(decimal)) return null;
    return { whole: 0, numerator: num, denominator: den };
  }

  // Integer or decimal: "3" or "2.25"
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = parseFloat(s);
  if (Number.isNaN(n) || !Number.isFinite(n) || n < 0) return null;
  const decimal = roundDecimal(n);
  const nice = decimalToNiceFraction(decimal);
  const whole = nice.whole ?? 0;
  let numerator = 0;
  let denominator = 0;
  if (nice.fraction) {
    const parts = nice.fraction.split("/").map(Number);
    if (parts.length === 2 && parts[1] > 0) {
      numerator = parts[0];
      denominator = parts[1];
    }
  }
  return { whole, numerator, denominator };
}

/**
 * Compute decimal from whole, numerator, denominator. Divide-by-zero safe:
 * only divide when den > 0 (and not null/undefined); otherwise fractional part is 0.
 */
export function decimalFromWholeNumDen(
  whole: number | null | undefined,
  num: number | null | undefined,
  den: number | null | undefined
): number {
  const w = whole ?? 0;
  const n = num ?? 0;
  const d = den ?? 0;
  const frac = d > 0 && Number.isFinite(n) && Number.isFinite(d) ? n / d : 0;
  return roundDecimal(w + frac);
}

/**
 * Format whole, numerator, denominator as display string (e.g. "2 1/2" or "3").
 * When denominator is 0 or null, or numerator is 0, omit the fraction.
 */
export function toDisplayQuantityFromInts(
  whole: number | null | undefined,
  num: number | null | undefined,
  den: number | null | undefined
): string {
  const w = whole ?? 0;
  const n = num ?? 0;
  const d = den ?? 0;
  if (d <= 0 || n <= 0) return w > 0 ? String(w) : "";
  return w > 0 ? `${w} ${n}/${d}` : `${n}/${d}`;
}

/**
 * Format whole + fraction for display.
 */
export function toDisplayQuantity(
  whole: number | null,
  fraction: string | null
): string {
  if (whole == null && !fraction) return "";
  if (whole != null && whole === 0 && !fraction) return "0";
  if (whole != null && whole > 0 && !fraction) return String(whole);
  if (!fraction) return "";
  if (whole == null || whole === 0) return fraction;
  return `${whole} ${fraction}`;
}

/**
 * Scale a quantity by factor and return nice whole + fraction + decimal.
 */
export function scaleQuantity(
  quantityDecimal: number,
  factor: number
): NiceFraction & { decimal: number } {
  const scaled = roundDecimal(quantityDecimal * factor);
  return { ...decimalToNiceFraction(scaled), decimal: scaled };
}
