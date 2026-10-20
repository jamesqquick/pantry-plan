import {
  hasAdditionalIngredientAmount,
  parseScalableIngredientLine,
} from "@/lib/ingredients/parse-ingredient-line-structured";
import {
  formatIngredientLine,
  type IngredientLineFields,
} from "@/lib/ingredients/format-ingredient-line";

export const RECIPE_SCALE_VALUES = [0.5, 1, 1.5, 2, 3, 4] as const;
export type RecipeScale = (typeof RECIPE_SCALE_VALUES)[number];

export interface RecipeIngredientForScaling extends IngredientLineFields {
  id: string;
  rawText?: string | null;
}

export interface ScaledRecipeIngredient {
  id: string;
  text: string;
  status: "scalable" | "unquantified" | "needs-review";
}

export function scaleRecipeIngredient(
  ingredient: RecipeIngredientForScaling,
  scale: RecipeScale,
): ScaledRecipeIngredient {
  const originalText = formatIngredientLine(ingredient);
  const amount = ingredient.quantity == null
    ? parseScalableIngredientLine(ingredient.displayText)
    : {
        kind: Number.isFinite(ingredient.quantity) && ingredient.quantity >= 0 &&
          !hasAdditionalIngredientAmount(ingredient.displayText, ingredient.unit)
          ? "scalable" as const
          : "needs-review" as const,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        displayText: ingredient.displayText,
      };

  if (amount.kind !== "scalable") {
    return { id: ingredient.id, text: originalText, status: amount.kind };
  }
  const quantity = amount.quantity * scale;
  if (!Number.isFinite(quantity)) {
    return { id: ingredient.id, text: originalText, status: "needs-review" };
  }
  return {
    id: ingredient.id,
    text: scale === 1 ? originalText : formatIngredientLine({ ...amount, quantity }),
    status: "scalable",
  };
}

export function scaleRecipeServings(servings: number | null, scale: RecipeScale): number | null {
  if (servings == null || !Number.isFinite(servings) || servings <= 0) return null;
  const scaled = servings * scale;
  return Number.isFinite(scaled) ? scaled : null;
}
