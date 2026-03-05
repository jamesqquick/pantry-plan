import type { IngredientUnit } from "@prisma/client";

export type { IngredientUnit };

/** Baking-relevant units: CUP-family volume, weight, count. */
export const MEASUREMENT_UNITS: IngredientUnit[] = [
  "COUNT",
  "TSP",
  "TBSP",
  "CUP",
  "PINCH",
  "G",
  "KG",
  "OZ",
  "LB",
];

export const VOLUME_UNITS: IngredientUnit[] = ["TSP", "TBSP", "CUP", "PINCH"];
export const WEIGHT_UNITS: IngredientUnit[] = ["G", "KG", "OZ", "LB"];
export const COUNT_UNITS: IngredientUnit[] = ["COUNT"];

export function isVolumeUnit(unit: IngredientUnit | null): boolean {
  return unit != null && VOLUME_UNITS.includes(unit);
}

export function isWeightUnit(unit: IngredientUnit | null): boolean {
  return unit != null && WEIGHT_UNITS.includes(unit);
}

export function isCountUnit(unit: IngredientUnit | null): boolean {
  return unit != null && COUNT_UNITS.includes(unit);
}
