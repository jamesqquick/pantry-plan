/**
 * Canonical unit conversion for grocery aggregation (server-only pure helpers).
 * Volume is CUP-family only (TSP, TBSP, CUP). No ml/l.
 */
import type { CostBasisUnit } from "@prisma/client";
import type { IngredientUnit } from "@prisma/client";

const CUPS_PER_TSP = 1 / 48;
const CUPS_PER_TBSP = 1 / 16;

const G_PER_KG = 1000;
const G_PER_OZ = 28.3495231;
const G_PER_LB = 453.59237;

/** Convert volume quantity to cups (TSP, TBSP, CUP only). */
export function toCups(
  quantity: number,
  unit: IngredientUnit
): number | null {
  switch (unit) {
    case "TSP":
      return quantity * CUPS_PER_TSP;
    case "TBSP":
      return quantity * CUPS_PER_TBSP;
    case "CUP":
      return quantity;
    default:
      return null;
  }
}

/** Convert weight quantity to grams. */
export function toGrams(
  quantity: number,
  unit: IngredientUnit
): number | null {
  switch (unit) {
    case "G":
      return quantity;
    case "KG":
      return quantity * G_PER_KG;
    case "LB":
      return quantity * G_PER_LB;
    case "OZ":
      return quantity * G_PER_OZ;
    default:
      return null;
  }
}

/** Convert count quantity to "each" (COUNT → number). */
export function toEach(
  quantity: number,
  unit: IngredientUnit
): number | null {
  return unit === "COUNT" ? quantity : null;
}

export type BasisUnitLabel = "g" | "cup" | "ea";

export type IngredientConversion = {
  gramsPerCup?: number | null;
  cupsPerEach?: number | null;
};

/**
 * Convert quantity+unit to the ingredient's basis unit.
 * Volume→weight only when ingredient has gramsPerCup.
 * Returns null if conversion not possible.
 */
export function convertToBasis(params: {
  quantity: number;
  unit: IngredientUnit | null;
  basisUnit: CostBasisUnit;
  ingredientConversion?: IngredientConversion | null;
}): { basisQty: number; basisUnitLabel: BasisUnitLabel } | null {
  const {
    quantity,
    unit,
    basisUnit,
    ingredientConversion,
  } = params;
  const u = unit ?? "COUNT";

  switch (basisUnit) {
    case "GRAM": {
      const direct = toGrams(quantity, u);
      if (direct != null) {
        return { basisQty: direct, basisUnitLabel: "g" };
      }
      const cups = toCups(quantity, u);
      const gramsPerCup = ingredientConversion?.gramsPerCup ?? null;
      if (cups != null && gramsPerCup != null) {
        return { basisQty: cups * gramsPerCup, basisUnitLabel: "g" };
      }
      return null;
    }
    case "CUP": {
      const cups = toCups(quantity, u);
      if (cups != null) {
        return { basisQty: cups, basisUnitLabel: "cup" };
      }
      return null;
    }
    case "EACH": {
      const count = toEach(quantity, u);
      if (count != null) {
        return { basisQty: count, basisUnitLabel: "ea" };
      }
      const cupsPerEach = ingredientConversion?.cupsPerEach ?? null;
      if (cupsPerEach != null && cupsPerEach > 0) {
        const cups = toCups(quantity, u);
        if (cups != null) {
          return { basisQty: cups / cupsPerEach, basisUnitLabel: "ea" };
        }
      }
      return null;
    }
    default:
      return null;
  }
}
