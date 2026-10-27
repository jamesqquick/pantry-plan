import { describe, expect, it } from "vitest";
import {
  importDraftSchema,
  importIngredientLineSchema,
  saveImportedRecipeTextOnlySchema,
} from "./import.schemas";

const recipe = {
  title: "Weeknight Pasta",
  instructions: ["Cook until tender."],
};

describe("saveImportedRecipeTextOnlySchema", () => {
  it("continues to accept raw text ingredient lines", () => {
    expect(
      saveImportedRecipeTextOnlySchema.safeParse({
        recipe,
        ingredients: ["2 cups flour", "3 eggs"],
      }).success,
    ).toBe(true);
  });

  it("accepts reviewed structured ingredient fields", () => {
    expect(
      saveImportedRecipeTextOnlySchema.safeParse({
        recipe,
        ingredients: [
          {
            rawText: "1½ cups flour",
            displayText: "flour",
            quantity: 1.5,
            unit: "CUP",
          },
          {
            rawText: "Salt to taste",
            displayText: "Salt to taste",
            quantity: 1,
            unit: "TSP",
          },
        ],
      }).success,
    ).toBe(true);
  });

  it.each([
    {},
    { quantity: 1 },
    { unit: "CUP" },
    { quantity: null, unit: "CUP" },
    { quantity: 1, unit: null },
    { quantity: null, unit: null },
    { quantity: "1", unit: "CUP" },
    { quantity: Number.NaN, unit: "CUP" },
    { quantity: -1, unit: "CUP" },
    { quantity: Number.POSITIVE_INFINITY, unit: "CUP" },
    { quantity: Number.NEGATIVE_INFINITY, unit: "CUP" },
    { quantity: 1, unit: "MILLILITER" },
  ])("rejects invalid reviewed ingredient fields: %o", (amount) => {
    const result = saveImportedRecipeTextOnlySchema.safeParse({
      recipe,
      ingredients: [
        {
          rawText: "1 cup flour",
          displayText: "flour",
          ...amount,
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("requires measurements on mapped and unmapped import lines", () => {
    for (const identity of [{}, { ingredientId: "salt" }, { createName: "Salt" }]) {
      const line = { originalLine: "Salt to taste", sortOrder: 0, ...identity };
      expect(importIngredientLineSchema.safeParse(line).success).toBe(false);
      expect(importIngredientLineSchema.safeParse({ ...line, quantity: 1 }).success).toBe(false);
      expect(importIngredientLineSchema.safeParse({ ...line, unit: "TSP" }).success).toBe(false);
      expect(importIngredientLineSchema.safeParse({ ...line, quantity: 0, unit: "TSP" }).success).toBe(true);
    }
  });

  it("keeps incomplete extracted drafts available for review", () => {
    expect(importDraftSchema.safeParse({
      title: "Soup",
      ingredients: ["Salt to taste", "pepper"],
    }).success).toBe(true);
  });
});
