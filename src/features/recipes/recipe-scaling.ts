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
  status: "scalable" | "needs-review";
}

export function scaleRecipeIngredient(
  ingredient: RecipeIngredientForScaling,
  scale: RecipeScale,
): ScaledRecipeIngredient {
  const originalText = formatIngredientLine(ingredient);
  if (
    ingredient.quantity == null ||
    ingredient.unit == null ||
    !Number.isFinite(ingredient.quantity) ||
    ingredient.quantity < 0
  ) {
    return { id: ingredient.id, text: originalText, status: "needs-review" };
  }

  const quantity = ingredient.quantity * scale;
  if (!Number.isFinite(quantity)) {
    return { id: ingredient.id, text: originalText, status: "needs-review" };
  }
  return {
    id: ingredient.id,
    text: scale === 1
      ? originalText
      : formatIngredientLine({ ...ingredient, quantity }),
    status: "scalable",
  };
}

export function scaleRecipeServings(servings: number | null, scale: RecipeScale): number | null {
  if (servings == null || !Number.isFinite(servings) || servings <= 0) return null;
  const scaled = servings * scale;
  return Number.isFinite(scaled) ? scaled : null;
}
