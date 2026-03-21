import type { CostBasisUnit } from "@/generated/prisma/client";
import type { IngredientUnit } from "@/generated/prisma/client";
import { convertToBasis } from "@/lib/grocery/canonical";

const CUPS_PER_TSP = 1 / 48;
const CUPS_PER_TBSP = 1 / 16;
/** Pinch ≈ 1/16 tsp. */
const CUPS_PER_PINCH = 1 / (16 * 48);

const G_PER_KG = 1000;
const G_PER_OZ = 28.3495231;
const G_PER_LB = 453.59237;

/**
 * Convert volume quantity to cups (includes PINCH).
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
 * Delegates to grocery canonical conversion without density bridges unless added later.
 */
export function toBasisQuantity(
  parsed: { quantity?: number | null; unit?: IngredientUnit | null },
  basisUnit: CostBasisUnit
): number | null {
  const qty = parsed.quantity ?? 1;
  const unit = parsed.unit ?? "COUNT";
  const r = convertToBasis({
    quantity: qty,
    unit,
    basisUnit,
    ingredientConversion: null,
  });
  return r?.basisQty ?? null;
}
