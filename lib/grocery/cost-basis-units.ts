/**
 * Cost basis = IngredientUnit minus PINCH. Single place for UI lists and display labels.
 */
import type { CostBasisUnit } from "@/generated/prisma/client";

export const COST_BASIS_UNITS: CostBasisUnit[] = [
  "G",
  "KG",
  "LB",
  "OZ",
  "TSP",
  "TBSP",
  "CUP",
  "COUNT",
];

/** Short label for grocery totals / kitchen display (not full prose). */
export const COST_BASIS_SHORT_LABELS: Record<CostBasisUnit, string> = {
  G: "g",
  KG: "kg",
  LB: "lb",
  OZ: "oz",
  TSP: "tsp",
  TBSP: "tbsp",
  CUP: "cup",
  COUNT: "ea",
};

/** Human label for ingredient detail / forms. */
export const COST_BASIS_LABELS: Record<CostBasisUnit, string> = {
  G: "gram",
  KG: "kilogram",
  LB: "pound",
  OZ: "ounce",
  TSP: "teaspoon",
  TBSP: "tablespoon",
  CUP: "cup",
  COUNT: "each",
};

/** Title case for UI selects. */
export const COST_BASIS_LABELS_TITLE: Record<CostBasisUnit, string> = {
  G: "Gram",
  KG: "Kilogram",
  LB: "Pound",
  OZ: "Ounce",
  TSP: "Teaspoon",
  TBSP: "Tablespoon",
  CUP: "Cup",
  COUNT: "Each (count)",
};

/**
 * Map cost basis to legacy 3-bucket canonical unit for display-units.ts (shopper prefs).
 * - Mass bases → GRAM
 * - Volume bases → CUP
 * - COUNT → EACH (display enum still uses EACH for “per item”)
 */
export function costBasisToCanonicalDisplay(
  u: CostBasisUnit,
): "GRAM" | "CUP" | "EACH" {
  if (u === "COUNT") return "EACH";
  if (u === "CUP" || u === "TSP" || u === "TBSP") return "CUP";
  return "GRAM";
}
