import { describe, expect, it, vi } from "vitest";
import { recipe, recipeIngredient, recipeInstruction } from "@/db";
import { createMcpRecipe } from "./create-recipe";

function createFakeDb() {
  const inserts: { table: unknown; values: unknown }[] = [];
  const batch = vi.fn(async () => undefined);
  const db = {
    insert(table: unknown) {
      return {
        values(values: unknown) {
          inserts.push({ table, values });
          return { table, values };
        },
      };
    },
    batch,
  };
  return { db: db as never, batch, inserts };
}

describe("createMcpRecipe", () => {
  it("stores structured ingredients and ordered instructions in one batch", async () => {
    const { db, batch, inserts } = createFakeDb();

    const result = await createMcpRecipe(db, "user-1", {
      title: "Tomato Soup",
      sourceUrl: "",
      imageUrl: "",
      servings: 4,
      prepTimeMinutes: 10,
      cookTimeMinutes: 20,
      totalTimeMinutes: 30,
      notes: "Add basil at the end.",
      ingredients: [
        {
          quantity: 2,
          unit: "COUNT",
          displayText: "cans tomatoes",
          rawText: "2 cans tomatoes",
        },
        { quantity: 1, unit: "CUP", displayText: "stock" },
      ],
      instructions: ["Combine ingredients", "Simmer"],
    });

    expect(result.recipeId).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(batch).toHaveBeenCalledOnce();
    expect(inserts).toHaveLength(3);
    expect(inserts[0]).toMatchObject({
      table: recipe,
      values: {
        id: result.recipeId,
        userId: "user-1",
        title: "Tomato Soup",
        sourceUrl: null,
        imageUrl: null,
        servings: 4,
      },
    });
    expect(inserts[1]).toMatchObject({
      table: recipeInstruction,
      values: [
        { recipeId: result.recipeId, sortOrder: 0, text: "Combine ingredients" },
        { recipeId: result.recipeId, sortOrder: 1, text: "Simmer" },
      ],
    });
    expect(inserts[2]).toMatchObject({
      table: recipeIngredient,
      values: [
        {
          recipeId: result.recipeId,
          ingredientId: null,
          quantity: 2,
          unit: "COUNT",
          displayText: "cans tomatoes",
          rawText: "2 cans tomatoes",
          sortOrder: 0,
        },
        {
          recipeId: result.recipeId,
          ingredientId: null,
          quantity: 1,
          unit: "CUP",
          displayText: "stock",
          rawText: null,
          sortOrder: 1,
        },
      ],
    });
  });

  it("chunks large instruction and ingredient lists", async () => {
    const { db, inserts } = createFakeDb();
    const instructions = Array.from({ length: 23 }, (_, index) => `Step ${index}`);
    const ingredients = Array.from({ length: 13 }, (_, index) => ({
      displayText: `Ingredient ${index}`,
    }));

    await createMcpRecipe(db, "user-1", {
      title: "Large Recipe",
      ingredients,
      instructions,
    });

    expect(inserts.filter((insert) => insert.table === recipeInstruction)).toHaveLength(2);
    expect(inserts.filter((insert) => insert.table === recipeIngredient)).toHaveLength(2);
  });
});
