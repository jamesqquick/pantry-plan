import { describe, expect, it } from "vitest";
import {
  RECIPE_SCALE_VALUES,
  scaleRecipeIngredient,
  scaleRecipeServings,
  type RecipeIngredientForScaling,
} from "./recipe-scaling";

const flour: RecipeIngredientForScaling = {
  id: "flour",
  quantity: 1.5,
  unit: "CUP",
  displayText: "flour",
};

describe("recipe scaling", () => {
  it.each([
    [0.5, "3/4 cup flour"],
    [1, "1 1/2 cups flour"],
    [1.5, "2 1/4 cups flour"],
    [2, "3 cups flour"],
    [3, "4 1/2 cups flour"],
    [4, "6 cups flour"],
  ] as const)("scales a structured ingredient at %s×", (scale, text) => {
    expect(scaleRecipeIngredient(flour, scale)).toEqual({
      id: "flour",
      text,
      status: "scalable",
    });
  });

  it("supports every preset and always calculates from the original", () => {
    for (const scale of [...RECIPE_SCALE_VALUES, 2, 0.5, 1] as const) {
      expect(scaleRecipeServings(4, scale)).toBe(4 * scale);
      scaleRecipeIngredient(flour, scale);
    }
    expect(flour.quantity).toBe(1.5);
    expect(scaleRecipeIngredient(flour, 1).text).toBe("1 1/2 cups flour");
  });

  it("scales unmapped text-only ingredients while preserving their original 1× text", () => {
    const ingredient = {
      id: "legacy",
      quantity: null,
      unit: null,
      displayText: "1½ cups flour",
      rawText: "1½ cups flour",
    };
    expect(scaleRecipeIngredient(ingredient, 1).text).toBe("1½ cups flour");
    expect(scaleRecipeIngredient(ingredient, 2).text).toBe("3 cups flour");
  });

  it("uses current fields instead of reparsing stale raw text", () => {
    expect(scaleRecipeIngredient({ ...flour, quantity: 2, rawText: "8 cups flour" }, 2).text)
      .toBe("4 cups flour");
    expect(scaleRecipeIngredient({ ...flour, quantity: null, displayText: "salt to taste", rawText: "1 tsp salt" }, 2))
      .toMatchObject({ text: "salt to taste", status: "unquantified" });
    expect(scaleRecipeIngredient({ ...flour, quantity: null, displayText: "flour", rawText: "8 cups flour" }, 2))
      .toMatchObject({ text: "flour", status: "needs-review" });
  });

  it("preserves fractional counts without a count label", () => {
    expect(scaleRecipeIngredient({ ...flour, quantity: 3, unit: "COUNT", displayText: "eggs" }, 0.5).text)
      .toBe("1 1/2 eggs");
    expect(scaleRecipeIngredient({ ...flour, quantity: 3, unit: null, displayText: "eggs" }, 0.5).text)
      .toBe("1 1/2 eggs");
  });

  it("scales a package count without changing the package size", () => {
    expect(scaleRecipeIngredient({ ...flour, quantity: null, unit: null, displayText: "2 (14 oz) cans tomatoes" }, 2).text)
      .toBe("4 (14 oz) cans tomatoes");
  });

  it("recognizes half and half as an ingredient name", () => {
    expect(scaleRecipeIngredient({ ...flour, quantity: 1, displayText: "half and half" }, 2))
      .toMatchObject({ text: "2 cups half and half", status: "scalable" });
  });

  it("does not silently scale additional quantities in structured descriptions", () => {
    expect(scaleRecipeIngredient({ ...flour, displayText: "flour (180 g)" }, 2))
      .toMatchObject({ text: "1 1/2 cups flour (180 g)", status: "needs-review" });
    expect(scaleRecipeIngredient({ ...flour, quantity: 2, unit: "COUNT", displayText: "-3 cloves garlic" }, 2).status)
      .toBe("needs-review");
  });

  it.each(["plus another tablespoon", "and another tablespoon", "plus extra tablespoon", "with an extra tablespoon"])("preserves compound amounts with %s", (additionalAmount) => {
    const displayText = `sugar, ${additionalAmount}`;
    const text = `1 cup ${displayText}`;
    expect(scaleRecipeIngredient({ ...flour, quantity: 1, displayText }, 2))
      .toMatchObject({ text, status: "needs-review" });
    expect(scaleRecipeIngredient({ ...flour, quantity: null, unit: null, displayText: text }, 2))
      .toMatchObject({ text, status: "needs-review" });
  });

  it.each([
    { displayText: "plus a tablespoon sugar", unit: "CUP" as const },
    { displayText: "or two cups milk", unit: "CUP" as const },
    { displayText: "⅙ tsp salt", unit: "COUNT" as const },
    { displayText: "flour (⅕ kg)", unit: "CUP" as const },
    { displayText: "tin chopped tomatoes", unit: "G" as const },
    { displayText: "bag chocolate chips", unit: "OZ" as const },
    { displayText: "ml milk", unit: "COUNT" as const },
    { displayText: "fl oz vanilla", unit: null },
    { displayText: "+ a tablespoon sugar", unit: "CUP" as const },
    { displayText: "minus a tablespoon flour", unit: "CUP" as const },
    { displayText: "butter (half an ounce)", unit: "TBSP" as const },
    { displayText: "heaping tbsp sugar", unit: "COUNT" as const },
    { displayText: "small tin chopped tomatoes", unit: "G" as const },
    { displayText: "resealable bag chocolate chips", unit: "OZ" as const },
    { displayText: "(one tin) chopped tomatoes", unit: "G" as const },
    { displayText: "to 2% salt", unit: "COUNT" as const },
  ])("preserves uncertain structured amounts: $displayText", (fields) => {
    const ingredient = { ...flour, ...fields, quantity: 1 };
    const original = scaleRecipeIngredient(ingredient, 1);
    expect(scaleRecipeIngredient(ingredient, 2)).toEqual({ ...original, status: "needs-review" });
  });

  it.each([null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])("ignores invalid base servings %s", (servings) => {
    expect(scaleRecipeServings(servings, 2)).toBeNull();
  });

  it("keeps fractional servings", () => {
    expect(scaleRecipeServings(3, 0.5)).toBe(1.5);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_VALUE])("leaves invalid or overflowing amounts %s for review", (quantity) => {
    expect(scaleRecipeIngredient({ ...flour, quantity }, 4).status).toBe("needs-review");
  });
});
