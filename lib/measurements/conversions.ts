import type { CostBasisUnit } from "@prisma/client";
import type { IngredientUnit } from "@prisma/client";

const CUPS_PER_TSP = 1 / 48;
const CUPS_PER_TBSP = 1 / 16;
/** Pinch ≈ 1/16 tsp. */
const CUPS_PER_PINCH = 1 / (16 * 48);

const G_PER_KG = 1000;
const G_PER_OZ = 28.3495231;
const G_PER_LB = 453.59237;

/**
 * Convert volume quantity to cups (TSP, TBSP, CUP only).
 */
export function volumeToCups(quantity: number, unit: IngredientUnit): number | null {
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

/**
 * Convert weight quantity to grams.
 */
export function weightToGrams(quantity: number, unit: IngredientUnit): number | null {
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

/**
 * Convert parsed quantity+unit to basis quantity (for cost/aggregation).
 * CUP basis: volume only (TSP/TBSP/CUP → cups). No density conversions here.
 */
export function toBasisQuantity(
  parsed: { quantity?: number | null; unit?: IngredientUnit | null },
  basisUnit: CostBasisUnit
): number | null {
  const qty = parsed.quantity ?? 1;
  const unit = parsed.unit ?? "COUNT";

  switch (basisUnit) {
    case "GRAM":
      return weightToGrams(qty, unit);
    case "CUP":
      return volumeToCups(qty, unit);
    case "EACH":
      return unit === "COUNT" ? qty : null;
    default:
      return null;
  }
}
