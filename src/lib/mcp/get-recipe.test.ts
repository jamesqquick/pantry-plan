import { describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { getMcpRecipe } from "./get-recipe";
import { RecipeNotFoundError } from "./recipe-errors";

function createFakeDb(recipeRows: unknown[]) {
  let selectCount = 0;
  const db = {
    select() {
      selectCount += 1;
      const rows =
        selectCount === 1
          ? recipeRows
          : selectCount === 2
            ? [
                {
                  quantity: 2,
                  unit: "COUNT",
                  displayText: "cans tomatoes",
                  rawText: "2 cans tomatoes",
                },
                {
                  quantity: 1,
                  unit: "CUP",
                  displayText: "stock",
                  rawText: null,
                },
              ]
            : [{ text: "Combine ingredients" }, { text: "Simmer" }];
      const chain = {
        from: () => chain,
        leftJoin: () => chain,
        where: () => chain,
        orderBy: async () => rows,
        limit: async () => rows,
      };
      return chain;
    },
  };
  return db as unknown as Db;
}

describe("getMcpRecipe", () => {
  it("returns ordered editable recipe content", async () => {
    const result = await getMcpRecipe(
      createFakeDb([
        {
          id: "recipe-1",
          title: "Tomato Soup",
          sourceUrl: null,
          imageUrl: null,
          servings: 4,
          prepTimeMinutes: 10,
          cookTimeMinutes: 20,
          totalTimeMinutes: 30,
          notes: "Add basil.",
        },
      ]),
      "user-1",
      "recipe-1",
    );

    expect(result).toEqual({
      id: "recipe-1",
      title: "Tomato Soup",
      sourceUrl: null,
      imageUrl: null,
      servings: 4,
      prepTimeMinutes: 10,
      cookTimeMinutes: 20,
      totalTimeMinutes: 30,
      notes: "Add basil.",
      ingredients: [
        {
          quantity: 2,
          unit: "COUNT",
          displayText: "cans tomatoes",
          rawText: "2 cans tomatoes",
        },
        { quantity: 1, unit: "CUP", displayText: "stock", rawText: null },
      ],
      instructions: ["Combine ingredients", "Simmer"],
    });
  });

  it("hides recipes owned by another user", async () => {
    await expect(
      getMcpRecipe(createFakeDb([]), "user-1", "recipe-1"),
    ).rejects.toBeInstanceOf(RecipeNotFoundError);
  });
});
