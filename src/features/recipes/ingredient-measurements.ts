import { z } from "zod";
import { INGREDIENT_UNITS } from "@/db/schema/enums";

export const requiredIngredientMeasurementsSchema = z.object({
  quantity: z
    .number({ error: "Quantity is required and must be a finite number." })
    .min(0, "Quantity must be 0 or greater"),
  unit: z.enum(INGREDIENT_UNITS, {
    error: `Unit is required and must be one of: ${INGREDIENT_UNITS.join(", ")}.`,
  }),
});

type RequiredIngredientMeasurements = z.infer<
  typeof requiredIngredientMeasurementsSchema
>;

export class IngredientMeasurementValidationError extends Error {
  constructor(public readonly ingredientErrors: readonly string[]) {
    super(`Ingredient measurements need correction. ${ingredientErrors.join(" ")}`);
    this.name = "IngredientMeasurementValidationError";
  }
}

export function validateIngredientMeasurements<
  T extends readonly {
    quantity?: unknown;
    unit?: unknown;
    displayText?: string | null;
    rawText?: string | null;
  }[],
>(
  ingredients: T,
): asserts ingredients is T & readonly (T[number] & RequiredIngredientMeasurements)[] {
  const ingredientErrors = ingredients.flatMap((ingredient, index) => {
    const result = requiredIngredientMeasurementsSchema.safeParse(ingredient);
    if (result.success) return [];

    const text = ingredient.displayText?.trim() || ingredient.rawText?.trim();
    const label = `Ingredient ${index + 1}${text ? ` ${JSON.stringify(text)}` : ""}`;
    return [`${label}: ${result.error.issues.map((issue) => issue.message).join("; ")}`];
  });

  if (ingredientErrors.length > 0) {
    throw new IngredientMeasurementValidationError(ingredientErrors);
  }
}
