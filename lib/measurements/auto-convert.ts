import type { IngredientUnit } from "@prisma/client";
import { volumeToCups, weightToGrams } from "./conversions";
import { isVolumeUnit, isWeightUnit } from "./units";

const RISKY_FLAGS = [
  "to taste",
  "garnish",
  "for garnish",
] as const;

const MILD_FLAGS = [
  "packed",
  "heaping",
  "sifted",
  "loosely",
  "firmly",
] as const;

/** Ingredients where weight/volume conversion is approximate (e.g. chocolate chips). */
const APPROXIMATE_INGREDIENT_NORMALIZED = new Set([
  "chocolate chips",
  "milk chocolate chips",
  "dark chocolate chips",
  "white chocolate chips",
  "caramel bits",
  "toffee bits",
  "sprinkles",
]);

export type ConversionConfidence = "HIGH" | "MEDIUM" | "LOW";

export type AutoConvertResult = {
  weightGrams?: number;
  conversionSource?: "AUTO";
  conversionConfidence?: ConversionConfidence;
  conversionNotes?: string;
};

type IngredientForConvert = {
  normalizedName?: string | null;
  gramsPerCup?: number | null;
};

function hasRiskyFlag(originalLine: string): boolean {
  const lower = originalLine.toLowerCase();
  return RISKY_FLAGS.some((f) => lower.includes(f));
}

function hasMildFlag(originalLine: string): boolean {
  const lower = originalLine.toLowerCase();
  return MILD_FLAGS.some((f) => lower.includes(f));
}

function isApproximateIngredient(ingredient: IngredientForConvert): boolean {
  const norm = (ingredient.normalizedName ?? "").toLowerCase();
  return APPROXIMATE_INGREDIENT_NORMALIZED.has(norm);
}

/**
 * Compute normalized weightGrams and conversion metadata for a recipe ingredient line.
 * - Volume units (TSP/TBSP/CUP) → weight when ingredient has gramsPerCup.
 * - Weight units → weightGrams.
 * - No ml/l; volume is CUP-family only.
 */
export function autoConvert(params: {
  quantity: number;
  unit: IngredientUnit | null;
  ingredient: IngredientForConvert;
  originalLine: string;
}): AutoConvertResult {
  const { quantity, unit, ingredient, originalLine } = params;
  const result: AutoConvertResult = {};

  if (hasRiskyFlag(originalLine)) {
    return result;
  }

  const qty = quantity || 1;

  if (isWeightUnit(unit)) {
    const g = weightToGrams(qty, unit!);
    if (g != null) {
      result.weightGrams = g;
    }
  }

  if (isVolumeUnit(unit)) {
    const gramsPerCup = ingredient.gramsPerCup ?? null;
    if (gramsPerCup != null) {
      const cups = volumeToCups(qty, unit!);
      if (cups != null) {
        result.weightGrams = cups * gramsPerCup;
      }
    }
  }

  if (result.weightGrams != null) {
    result.conversionSource = "AUTO";

    if (isApproximateIngredient(ingredient)) {
      result.conversionConfidence = "LOW";
      result.conversionNotes = "Approximate; ingredient density varies.";
    } else if (hasMildFlag(originalLine)) {
      result.conversionConfidence = "MEDIUM";
      result.conversionNotes = "Original line contains packed/heaping/sifted etc.; conversion is approximate.";
    } else {
      result.conversionConfidence = "HIGH";
    }
  }

  return result;
}
