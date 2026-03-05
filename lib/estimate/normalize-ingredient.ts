const DESCRIPTORS = new Set([
  "fresh",
  "dried",
  "chopped",
  "minced",
  "diced",
  "sliced",
  "grated",
  "divided",
  "to taste",
  "optional",
  "large",
  "small",
  "medium",
  "extra",
  "finely",
  "roughly",
  "freshly",
  "packed",
]);

const PLURAL_MAP: Record<string, string> = {
  cups: "cup",
  tablespoons: "tbsp",
  tsp: "tsp",
  tbsp: "tbsp",
  ounces: "oz",
  pounds: "lb",
  grams: "g",
  kilograms: "kg",
  cloves: "clove",
  stalks: "stalk",
  slices: "slice",
  cans: "can",
  bottles: "bottle",
};

/**
 * Normalize ingredient line for grouping: remove parentheticals, punctuation,
 * common descriptors; light plural normalization.
 */
export function normalizeIngredientName(line: string): string {
  let s = line
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/[,;]/g, " ")
    .trim()
    .toLowerCase();
  const words = s.split(/\s+/).filter((w) => {
    if (DESCRIPTORS.has(w)) return false;
    if (/^\d+$/.test(w)) return false;
    if (/^[\d./]+$/.test(w)) return false;
    return true;
  });
  s = words.join(" ").replace(/\s+/g, " ").trim();
  for (const [plural, singular] of Object.entries(PLURAL_MAP)) {
    const re = new RegExp(`\\b${plural}\\b`, "gi");
    s = s.replace(re, singular);
  }
  return s || line.trim();
}
