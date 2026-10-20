import { describe, expect, it } from "vitest";
import { saveImportedRecipeTextOnlySchema } from "./import.schemas";

const recipe = {
  title: "Weeknight Pasta",
  instructions: ["Cook until tender."],
};

describe("saveImportedRecipeTextOnlySchema", () => {
  it("continues to accept raw text ingredient lines", () => {
    expect(
      saveImportedRecipeTextOnlySchema.safeParse({
        recipe,
        ingredients: ["2 cups flour", "Salt to taste"],
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
            quantity: null,
            unit: null,
          },
        ],
      }).success,
    ).toBe(true);
  });

  it.each([
    { quantity: -1, unit: "CUP" },
    { quantity: Number.POSITIVE_INFINITY, unit: "CUP" },
    { quantity: 1, unit: "MILLILITER" },
  ])("rejects invalid reviewed ingredient fields: %o", (amount) => {
    const result = saveImportedRecipeTextOnlySchema.safeParse({
      recipe,
      ingredients: [
        {
          rawText: "1 cup flour",
          displayText: "flour",
          quantity: amount.quantity,
          unit: amount.unit,
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
