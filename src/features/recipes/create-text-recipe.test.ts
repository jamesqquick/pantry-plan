import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recipe, recipeIngredient, recipeInstruction, recipeTag } from "@/db";
import type { SaveImportedRecipeTextOnlyInput } from "@/features/import/import.schemas";
import { createTestDb } from "@/test/d1";
import { createTextOnlyRecipe } from "./create-text-recipe";
import { IngredientMeasurementValidationError } from "./ingredient-measurements";

let test: ReturnType<typeof createTestDb>;
beforeEach(() => {
  test = createTestDb();
  test.sqlite.exec(`INSERT INTO user (id, name, email, createdAt, updatedAt)
    VALUES ('cook', 'Cook', 'cook@example.test', 1, 1)`);
});
afterEach(() => {
  vi.restoreAllMocks();
  test.sqlite.close();
});

const recipeData = { title: "Pancakes", instructions: ["Mix and cook."], tagIds: [] };

describe("quick recipe saves", () => {
  it("stores safely parsed quantities independently of mapping", async () => {
    const lines = [
      "1½ cups flour",
      "3 eggs",
      "  0 tsp pepper  ",
      "2 cups semisweet chocolate chips ((12 oz))",
    ];

    await createTextOnlyRecipe(test.db, "cook", {
      recipe: recipeData,
      ingredients: lines,
    });

    const rows = await test.db.select().from(recipeIngredient);
    expect(rows.map(({ ingredientId }) => ingredientId)).toEqual(lines.map(() => null));
    expect(rows.map(({ quantity, unit, displayText, rawText }) => ({ quantity, unit, displayText, rawText })))
      .toEqual([
        { quantity: 1.5, unit: "CUP", displayText: "flour", rawText: lines[0] },
        { quantity: 3, unit: "COUNT", displayText: "eggs", rawText: lines[1] },
        { quantity: 0, unit: "TSP", displayText: "pepper", rawText: lines[2] },
        {
          quantity: 2,
          unit: "CUP",
          displayText: "semisweet chocolate chips ((12 oz))",
          rawText: lines[3],
        },
      ]);
  });

  it.each([
    "Salt to taste", "pepper", "2-3 cloves garlic", "1 ⅙ tsp salt",
    "0.75 l milk", "500 ml milk", "1 fl oz vanilla", `${"1" + "0".repeat(303)} g flour`,
    "2 heaping tbsp sugar", "2 rounded tsp sugar",
    "1 to 2% salt",
  ])("rejects unresolved raw input before queries or mutations: %s", async (line) => {
    const select = vi.spyOn(test.db, "select");
    const insert = vi.spyOn(test.db, "insert");
    const batch = vi.spyOn(test.db, "batch");
    const result = createTextOnlyRecipe(test.db, "cook", {
      recipe: { ...recipeData, tagIds: ["unowned-tag"] },
      ingredients: ["1 cup flour", line],
    });

    await expect(result).rejects.toBeInstanceOf(IngredientMeasurementValidationError);
    await expect(result).rejects.toMatchObject({
      message: expect.stringMatching(/Ingredient 2.*Quantity.*Unit/),
    });
    expect(select).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
    expect(await test.db.select().from(recipe)).toEqual([]);
    expect(await test.db.select().from(recipeIngredient)).toEqual([]);
    expect(await test.db.select().from(recipeInstruction)).toEqual([]);
    expect(await test.db.select().from(recipeTag)).toEqual([]);
  });

  it.each([
    {},
    { quantity: 1 },
    { unit: "TSP" },
    { quantity: null, unit: "TSP" },
    { quantity: 1, unit: null },
    { quantity: null, unit: null },
    { quantity: "1", unit: "TSP" },
    { quantity: Number.NaN, unit: "TSP" },
    { quantity: Number.POSITIVE_INFINITY, unit: "TSP" },
    { quantity: -1, unit: "TSP" },
    { quantity: 1, unit: "ML" },
  ])("validates direct helper calls with invalid reviewed measurements: %o", async (amount) => {
    const result = createTextOnlyRecipe(test.db, "cook", {
      recipe: recipeData,
      ingredients: [{
        rawText: "Salt to taste",
        displayText: "salt to taste",
        ...amount,
      }] as unknown as SaveImportedRecipeTextOnlyInput["ingredients"],
    });

    await expect(result).rejects.toBeInstanceOf(IngredientMeasurementValidationError);
    expect(await test.db.select().from(recipe)).toEqual([]);
    expect(await test.db.select().from(recipeIngredient)).toEqual([]);
  });

  it("stores reviewed ingredient fields without reparsing or rounding", async () => {
    await createTextOnlyRecipe(test.db, "cook", {
      recipe: { title: "Pasta", instructions: ["Cook."], tagIds: [] },
      ingredients: [
        {
          rawText: "2-3 cloves garlic",
          displayText: "cloves garlic",
          quantity: 2,
          unit: "COUNT",
        },
        {
          rawText: "1 cup flour (120 g)",
          displayText: "1 cup flour (120 g)",
          quantity: 1,
          unit: "CUP",
        },
        {
          rawText: null,
          displayText: "saffron",
          quantity: 1 / 3,
          unit: "G",
        },
        {
          rawText: "  Salt to taste  ",
          displayText: "salt to taste",
          quantity: 1,
          unit: "TSP",
        },
      ],
    });

    const rows = await test.db.select().from(recipeIngredient);
    expect(rows.map(({ quantity, unit, displayText, rawText }) => ({
      quantity,
      unit,
      displayText,
      rawText,
    }))).toEqual([
      { quantity: 2, unit: "COUNT", displayText: "cloves garlic", rawText: "2-3 cloves garlic" },
      { quantity: 1, unit: "CUP", displayText: "1 cup flour (120 g)", rawText: "1 cup flour (120 g)" },
      { quantity: 1 / 3, unit: "G", displayText: "saffron", rawText: null },
      { quantity: 1, unit: "TSP", displayText: "salt to taste", rawText: "  Salt to taste  " },
    ]);
  });
});
