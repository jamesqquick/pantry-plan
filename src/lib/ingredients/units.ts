import type { IngredientDisplayUnit, IngredientUnit } from "@/db/schema/enums";

export type { IngredientUnit };

export const INGREDIENT_UNITS: IngredientUnit[] = [
  "COUNT",
  "TSP",
  "TBSP",
  "CUP",
  "OZ",
  "LB",
  "G",
  "KG",
  "PINCH",
];

export const UNIT_LABELS: Record<IngredientUnit, string> = {
  COUNT: "count",
  TSP: "tsp",
  TBSP: "tbsp",
  CUP: "cup",
  OZ: "oz",
  LB: "lb",
  G: "g",
  KG: "kg",
  PINCH: "pinch",
};

export const DISPLAY_UNIT_LABELS: Record<IngredientDisplayUnit, string> = {
  AUTO: "Auto",
  EACH: "count",
  GRAM: "g",
  KG: "kg",
  OZ: "oz",
  LB: "lb",
  CUP: "cup",
  TBSP: "tbsp",
  TSP: "tsp",
};

/** Map normalized unit label to enum for import/parsing. */
export const UNIT_FROM_LABEL: Record<string, IngredientUnit> = {
  count: "COUNT",
  tsp: "TSP",
  tbsp: "TBSP",
  cup: "CUP",
  oz: "OZ",
  lb: "LB",
  g: "G",
  kg: "KG",
  pinch: "PINCH",
};
