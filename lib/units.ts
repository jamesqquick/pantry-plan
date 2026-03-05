/**
 * Unit normalization and display formatting.
 * Works with string labels (cup, tbsp, tsp, g, oz, etc.). Client-safe.
 */

/** Map raw input to normalized unit label (singular). */
const UNIT_ALIASES: Record<string, string> = {
  cup: "cup",
  cups: "cup",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tbsp: "tbsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  tsp: "tsp",
  gram: "g",
  grams: "g",
  g: "g",
  ounce: "oz",
  ounces: "oz",
  oz: "oz",
  pound: "lb",
  pounds: "lb",
  lb: "lb",
  lbs: "lb",
  kilogram: "kg",
  kilograms: "kg",
  kg: "kg",
  count: "count",
  each: "count",
  ea: "count",
  pinch: "pinch",
  pinches: "pinch",
};

/**
 * Normalize a raw unit string to a canonical label (e.g. "cups" → "cup", "tablespoons" → "tbsp").
 * Returns null if not recognized.
 */
export function normalizeUnit(unitRaw: string): string | null {
  const key = unitRaw.trim().toLowerCase();
  if (key === "") return null;
  return UNIT_ALIASES[key] ?? null;
}

/** Units that are pluralized for display (cup → cups when qty !== 1). */
const PLURALIZE_UNITS = new Set(["cup", "ounce", "pound", "gram", "kilogram", "count", "pinch"]);

/**
 * Format unit for display with optional pluralization.
 * tbsp/tsp stay unchanged. Countable units pluralize when quantity is not 1.
 * null unit returns "".
 */
export function formatUnitForDisplay(
  unit: string | null,
  quantityDecimal: number | null
): string {
  if (unit == null || unit === "") return "";
  const qty = quantityDecimal != null ? quantityDecimal : 1;
  const singular = unit.toLowerCase();
  if (!PLURALIZE_UNITS.has(singular)) return singular;
  if (qty === 1 || Math.abs(qty - 1) < 1e-6) return singular;
  const plurals: Record<string, string> = {
    cup: "cups",
    ounce: "ounces",
    pound: "pounds",
    gram: "grams",
    kilogram: "kilograms",
    count: "count",
    pinch: "pinches",
  };
  return plurals[singular] ?? `${singular}s`;
}
