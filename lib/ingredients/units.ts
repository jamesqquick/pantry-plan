import { IngredientUnit } from "@/generated/prisma/client";

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
