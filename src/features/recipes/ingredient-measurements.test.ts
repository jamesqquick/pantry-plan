import { describe, expect, it } from "vitest";
import { INGREDIENT_UNITS } from "@/db/schema/enums";
import {
  IngredientMeasurementValidationError,
  requiredIngredientMeasurementsSchema,
  validateIngredientMeasurements,
} from "./ingredient-measurements";
import { recipeIngredientItemSchema } from "./recipe-ingredients.schemas";

describe("required ingredient measurements", () => {
  it.each([
    {},
    { quantity: 1 },
    { unit: "TSP" },
    { quantity: null, unit: "TSP" },
    { quantity: 1, unit: null },
    { quantity: null, unit: null },
    { quantity: "1", unit: "TSP" },
    { quantity: "", unit: "TSP" },
    { quantity: Number.NaN, unit: "TSP" },
    { quantity: Number.POSITIVE_INFINITY, unit: "TSP" },
    { quantity: Number.NEGATIVE_INFINITY, unit: "TSP" },
    { quantity: -0.01, unit: "TSP" },
    { quantity: 1, unit: "ML" },
    { quantity: 1, unit: "" },
  ])("rejects incomplete or invalid measurements: %o", (amount) => {
    expect(requiredIngredientMeasurementsSchema.safeParse(amount).success).toBe(false);
    expect(recipeIngredientItemSchema.safeParse({
      ...amount,
      displayText: "salt to taste",
      sortOrder: 0,
    }).success).toBe(false);
  });

  it.each(INGREDIENT_UNITS)("keeps zero and fractional %s measurements valid", (unit) => {
    for (const quantity of [0, 1 / 3, 0.000000123456789]) {
      const amount = { quantity, unit };
      expect(requiredIngredientMeasurementsSchema.parse(amount)).toEqual(amount);
    }
  });

  it("identifies every incomplete ingredient and its missing fields", () => {
    expect.assertions(2);
    try {
      validateIngredientMeasurements([
        { quantity: 2, unit: "COUNT", displayText: "eggs" },
        { unit: "TSP", displayText: "salt to taste" },
        { quantity: 0.5, displayText: "pepper" },
        { rawText: "herbs as needed" },
      ]);
    } catch (error) {
      expect(error).toBeInstanceOf(IngredientMeasurementValidationError);
      expect(error).toMatchObject({
        ingredientErrors: [
          expect.stringMatching(/Ingredient 2 "salt to taste": Quantity/),
          expect.stringMatching(/Ingredient 3 "pepper": Unit/),
          expect.stringMatching(/Ingredient 4 "herbs as needed": Quantity.*Unit/),
        ],
      });
    }
  });

  it("validates reviewed measurements without changing precision or text", () => {
    const ingredient = Object.freeze({
      quantity: 1 / 3,
      unit: "TSP",
      displayText: "salt to taste",
      rawText: "Salt to taste",
    });
    expect(() => validateIngredientMeasurements([ingredient])).not.toThrow();
    expect(ingredient.quantity).toBe(1 / 3);
    expect(ingredient.rawText).toBe("Salt to taste");
  });
});
