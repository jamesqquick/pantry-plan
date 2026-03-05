import { parseQuantityPrefix } from "@/lib/ingredients/parse-quantity";
import type { Unit } from "./units";

const UNIT_PATTERNS: { re: RegExp; unit: Unit }[] = [
  { re: /\b(tsp|teaspoon)s?\b/i, unit: "TSP" },
  { re: /\b(tbsp|tablespoon)s?\b/i, unit: "TBSP" },
  { re: /\bcups?\b/i, unit: "CUP" },
  { re: /\b(oz|ounce)s?\b/i, unit: "OZ" },
  { re: /\b(lb|lbs|pound)s?\b/i, unit: "LB" },
  { re: /\b(g|gram)s?\b/i, unit: "G" },
  { re: /\b(kg|kilogram)s?\b/i, unit: "KG" },
  { re: /\b(count|each)s?\b/i, unit: "COUNT" },
];

export type ParsedLine = {
  name: string;
  qty?: number;
  unit?: Unit;
  original: string;
};

/**
 * Parse one ingredient line: optional qty (including fractions), optional unit, name.
 */
export function parseIngredientLine(line: string): ParsedLine {
  const original = line.trim();
  const { quantity, remainder } = parseQuantityPrefix(original);
  let namePart = remainder;

  let unit: Unit | undefined;
  for (const { re, unit: u } of UNIT_PATTERNS) {
    const m = namePart.match(re);
    if (m) {
      unit = u;
      namePart = namePart.replace(m[0], " ").replace(/\s+/g, " ").trim();
      break;
    }
  }

  const name = namePart.replace(/\s+/g, " ").trim() || original;
  return { name, qty: quantity ?? undefined, unit, original };
}
