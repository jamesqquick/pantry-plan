import { afterEach, describe, expect, it, vi } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { recipe, recipeIngredient, recipeInstruction } from "@/db";
import type { CreateRecipeToolInput } from "@/features/mcp/mcp.schemas";
import { IngredientMeasurementValidationError } from "@/features/recipes/ingredient-measurements";
import { createTestDb } from "@/test/d1";
import { createMcpRecipe } from "./create-recipe";

let sqlite: DatabaseSync | undefined;
afterEach(() => {
  vi.restoreAllMocks();
  sqlite?.close();
  sqlite = undefined;
});

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
      quantity: 1,
      unit: "COUNT" as const,
    }));

    await createMcpRecipe(db, "user-1", {
      title: "Large Recipe",
      ingredients,
      instructions,
    });

    expect(inserts.filter((insert) => insert.table === recipeInstruction)).toHaveLength(2);
    expect(inserts.filter((insert) => insert.table === recipeIngredient)).toHaveLength(2);
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
  ])("rejects invalid direct creation before any writes: %o", async (amount) => {
    const test = createTestDb();
    sqlite = test.sqlite;
    sqlite.exec(`INSERT INTO user (id, name, email, createdAt, updatedAt)
      VALUES ('cook', 'Cook', 'cook@example.test', 1, 1)`);
    const insert = vi.spyOn(test.db, "insert");
    const batch = vi.spyOn(test.db, "batch");

    await expect(createMcpRecipe(test.db, "cook", {
      title: "Soup",
      ingredients: [{ displayText: "salt to taste", ...amount }],
      instructions: ["Season."],
    } as unknown as CreateRecipeToolInput)).rejects.toBeInstanceOf(IngredientMeasurementValidationError);

    expect(insert).not.toHaveBeenCalled();
    expect(batch).not.toHaveBeenCalled();
    expect(await test.db.select().from(recipe)).toEqual([]);
    expect(await test.db.select().from(recipeIngredient)).toEqual([]);
    expect(await test.db.select().from(recipeInstruction)).toEqual([]);
  });

  it("preserves measured descriptions, original raw text, and numeric precision", async () => {
    const test = createTestDb();
    sqlite = test.sqlite;
    sqlite.exec(`INSERT INTO user (id, name, email, createdAt, updatedAt)
      VALUES ('cook', 'Cook', 'cook@example.test', 1, 1)`);
    await createMcpRecipe(test.db, "cook", {
      title: "Soup",
      ingredients: [{
        displayText: "salt to taste",
        rawText: "  Salt to taste  ",
        quantity: 1 / 3,
        unit: "TSP",
      }],
      instructions: ["Season."],
    });

    expect(await test.db.select().from(recipeIngredient)).toMatchObject([{
      quantity: 1 / 3,
      unit: "TSP",
      displayText: "salt to taste",
      rawText: "  Salt to taste  ",
      ingredientId: null,
    }]);
  });
});
