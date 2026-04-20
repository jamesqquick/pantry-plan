/**
 * Canonical unit conversion for grocery aggregation (pure helpers).
 * Cost basis units match IngredientUnit except PINCH (not a cost basis).
 */
import type { CostBasisUnit, IngredientUnit } from "@/db/schema/enums";
import { COST_BASIS_SHORT_LABELS } from "./cost-basis-units";

const CUPS_PER_TSP = 1 / 48;
const CUPS_PER_TBSP = 1 / 16;
/** Pinch ≈ 1/16 tsp → cups */
const CUPS_PER_PINCH = 1 / (16 * 48);

const G_PER_KG = 1000;
const G_PER_OZ = 28.3495231;
const G_PER_LB = 453.59237;

/** Recipe line volume → cups (includes PINCH). */
export function lineVolumeToCups(
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
    case "PINCH":
      return quantity * CUPS_PER_PINCH;
    default:
      return null;
  }
}

/** @deprecated Use lineVolumeToCups — kept for migration callers. */
export function toCups(quantity: number, unit: IngredientUnit): number | null {
  return lineVolumeToCups(quantity, unit);
}

/** Direct mass line units → grams (no density). */
export function toGrams(quantity: number, unit: IngredientUnit): number | null {
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

export function toEach(quantity: number, unit: IngredientUnit): number | null {
  return unit === "COUNT" ? quantity : null;
}

export type BasisUnitLabel = string;

export type IngredientConversion = {
  gramsPerCup?: number | null;
  cupsPerEach?: number | null;
};

function lineToGrams(
  quantity: number,
  unit: IngredientUnit,
  gramsPerCup: number | null | undefined
): number | null {
  const g = toGrams(quantity, unit);
  if (g != null) return g;
  const cups = lineVolumeToCups(quantity, unit);
  if (cups != null && gramsPerCup != null) {
    return cups * gramsPerCup;
  }
  return null;
}

function lineToCups(
  quantity: number,
  unit: IngredientUnit,
  gramsPerCup: number | null | undefined
): number | null {
  const c = lineVolumeToCups(quantity, unit);
  if (c != null) return c;
  const g = toGrams(quantity, unit);
  if (g != null && gramsPerCup != null && gramsPerCup > 0) {
    return g / gramsPerCup;
  }
  return null;
}

/**
 * Convert quantity+unit to the ingredient's cost basis unit.
 * Cross-dimensional: uses gramsPerCup and cupsPerEach when set.
 */
export function convertToBasis(params: {
  quantity: number;
  unit: IngredientUnit | null;
  basisUnit: CostBasisUnit;
  ingredientConversion?: IngredientConversion | null;
}): { basisQty: number; basisUnitLabel: BasisUnitLabel } | null {
  const { quantity, unit, basisUnit, ingredientConversion } = params;
  const u = unit ?? "COUNT";
  const gpc = ingredientConversion?.gramsPerCup ?? null;
  const cpe = ingredientConversion?.cupsPerEach ?? null;
  const label = (k: CostBasisUnit) => COST_BASIS_SHORT_LABELS[k];

  switch (basisUnit) {
    case "G": {
      const grams = lineToGrams(quantity, u, gpc);
      if (grams == null) return null;
      return { basisQty: grams, basisUnitLabel: label("G") };
    }
    case "KG": {
      const grams = lineToGrams(quantity, u, gpc);
      if (grams == null) return null;
      return { basisQty: grams / G_PER_KG, basisUnitLabel: label("KG") };
    }
    case "LB": {
      const grams = lineToGrams(quantity, u, gpc);
      if (grams == null) return null;
      return { basisQty: grams / G_PER_LB, basisUnitLabel: label("LB") };
    }
    case "OZ": {
      const grams = lineToGrams(quantity, u, gpc);
      if (grams == null) return null;
      return { basisQty: grams / G_PER_OZ, basisUnitLabel: label("OZ") };
    }
    case "CUP": {
      const cups = lineToCups(quantity, u, gpc);
      if (cups == null) return null;
      return { basisQty: cups, basisUnitLabel: label("CUP") };
    }
    case "TSP": {
      const cups = lineToCups(quantity, u, gpc);
      if (cups == null) return null;
      return { basisQty: cups / CUPS_PER_TSP, basisUnitLabel: label("TSP") };
    }
    case "TBSP": {
      const cups = lineToCups(quantity, u, gpc);
      if (cups == null) return null;
      return { basisQty: cups / CUPS_PER_TBSP, basisUnitLabel: label("TBSP") };
    }
    case "COUNT": {
      const count = toEach(quantity, u);
      if (count != null) {
        return { basisQty: count, basisUnitLabel: label("COUNT") };
      }
      if (cpe != null && cpe > 0) {
        const cups = lineToCups(quantity, u, gpc);
        if (cups != null) {
          return { basisQty: cups / cpe, basisUnitLabel: label("COUNT") };
        }
      }
      return null;
    }
  }
}
