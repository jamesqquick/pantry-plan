/**
 * Cost basis = IngredientUnit minus PINCH.
 * Select / read-only labels match `UNIT_LABELS` in `@/lib/ingredients/units`.
 */
import type { CostBasisUnit } from "@/db/schema/enums";
import { UNIT_LABELS } from "@/lib/ingredients/units";

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

/** Same strings as default-unit dropdown (`UNIT_LABELS`) for each cost basis. */
export const COST_BASIS_LABELS_TITLE: Record<CostBasisUnit, string> =
  COST_BASIS_UNITS.reduce(
    (acc, u) => {
      acc[u] = UNIT_LABELS[u];
      return acc;
    },
    {} as Record<CostBasisUnit, string>
  );

/** "Cents per …" copy. */
export const COST_BASIS_LABELS: Record<CostBasisUnit, string> =
  COST_BASIS_LABELS_TITLE;

/**
 * Map cost basis to legacy 3-bucket canonical unit for display-units.ts
 * (shopper preferences).
 * - Mass bases → GRAM
 * - Volume bases → CUP
 * - COUNT → EACH
 */
export function costBasisToCanonicalDisplay(
  u: CostBasisUnit
): "GRAM" | "CUP" | "EACH" {
  if (u === "COUNT") return "EACH";
  if (u === "CUP" || u === "TSP" || u === "TBSP") return "CUP";
  return "GRAM";
}
