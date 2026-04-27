/**
 * Enum string unions that mirror the Prisma schema enums.
 * SQLite/D1 has no native enum support; we store these as TEXT
 * and rely on app-level validation (Zod) + CHECK constraints where useful.
 */

export const USER_ROLES = ["USER", "ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const MEAL_SLOTS = ["BREAKFAST", "LUNCH", "DINNER"] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const INGREDIENT_UNITS = [
  "COUNT",
  "TSP",
  "TBSP",
  "CUP",
  "OZ",
  "LB",
  "G",
  "KG",
  "PINCH",
] as const;
export type IngredientUnit = (typeof INGREDIENT_UNITS)[number];

export const COST_BASIS_UNITS = [
  "G",
  "KG",
  "LB",
  "OZ",
  "TSP",
  "TBSP",
  "CUP",
  "COUNT",
] as const;
export type CostBasisUnit = (typeof COST_BASIS_UNITS)[number];

export const INGREDIENT_DISPLAY_UNITS = [
  "AUTO",
  "GRAM",
  "CUP",
  "EACH",
  "TBSP",
  "TSP",
] as const;
export type IngredientDisplayUnit = (typeof INGREDIENT_DISPLAY_UNITS)[number];
