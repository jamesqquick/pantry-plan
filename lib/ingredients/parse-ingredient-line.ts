/**
 * Parse a single ingredient line into quantity, unit, and name.
 * Client-safe (no Prisma DB/auth; IngredientUnit is type-only).
 */

import type { IngredientUnit } from "@/generated/prisma/client";
import { htmlToText } from "./html-to-text";
import { normalizeFractionText } from "./fractions";
import { parseQuantityPrefix } from "./parse-quantity";

const UNIT_PATTERNS: { re: RegExp; unit: IngredientUnit }[] = [
  { re: /\b(tsp|teaspoon)s?\b/i, unit: "TSP" },
  { re: /\b(tbsp|tablespoon)s?\b/i, unit: "TBSP" },
  { re: /\bcups?\b/i, unit: "CUP" },
  { re: /\bpinch(es)?\b/i, unit: "PINCH" },
  { re: /\b(oz|ounce)s?\b/i, unit: "OZ" },
  { re: /\b(lb|lbs|pound)s?\b/i, unit: "LB" },
  { re: /\b(g|gram)s?\b/i, unit: "G" },
  { re: /\b(kg|kilogram)s?\b/i, unit: "KG" },
  { re: /\b(count|each)s?\b/i, unit: "COUNT" },
];

export type ParseIngredientLineResult = {
  quantityText: string | null;
  quantity: number | null;
  unit: IngredientUnit | null;
  name: string;
};

/**
 * Parse one ingredient line into quantity (text + number), unit, and name.
 * Uses normalizeFractionText so unicode fractions (½, ⅓, etc.) are supported.
 */
export function parseIngredientLine(line: string): ParseIngredientLineResult {
  const plain = htmlToText(line);
  const normalized = normalizeFractionText(plain);
  const { quantityText, quantity, remainder: remainderAfterQty } = parseQuantityPrefix(normalized);
  let remainder = remainderAfterQty;

  let unit: IngredientUnit | null = null;
  for (const { re, unit: u } of UNIT_PATTERNS) {
    const m = remainder.match(re);
    if (m) {
      unit = u;
      remainder = remainder.replace(m[0], " ").replace(/\s+/g, " ").trim();
      break;
    }
  }

  // If we have a quantity but no unit was matched, default to COUNT (e.g. "2 large eggs" → unit count)
  if (quantity != null && unit == null) {
    unit = "COUNT";
  }

  const name = remainder.trim();
  return { quantityText, quantity, unit, name };
}
