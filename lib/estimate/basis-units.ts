import type { CostBasisUnit } from "@/generated/prisma/client";
import type { Unit } from "./units";

const G_PER_OZ = 28.3495;
const G_PER_LB = 453.592;

export function toGrams(quantity: number, unit: Unit): number | null {
  switch (unit) {
    case "G":
      return quantity;
    case "KG":
      return quantity * 1000;
    case "OZ":
      return quantity * G_PER_OZ;
    case "LB":
      return quantity * G_PER_LB;
    default:
      return null;
  }
}

const CUPS_PER_TSP = 1 / 48;
const CUPS_PER_TBSP = 1 / 16;

export function toCups(quantity: number, unit: Unit): number | null {
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

export function toBasisQuantity(
  parsed: { quantity?: number | null; unit?: Unit | null },
  basisUnit: CostBasisUnit
): number | null {
  const qty = parsed.quantity ?? 1;
  const unit = parsed.unit ?? "COUNT";

  switch (basisUnit) {
    case "GRAM":
      return toGrams(qty, unit);
    case "CUP":
      return toCups(qty, unit);
    case "EACH":
      return unit === "COUNT" ? qty : null;
    default:
      return null;
  }
}
