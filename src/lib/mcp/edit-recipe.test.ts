import { afterEach, describe, expect, it, vi } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { recipe, recipeIngredient, recipeInstruction } from "@/db";
import type { IngredientUnit } from "@/db/schema/enums";
import type { EditRecipeToolInput } from "@/features/mcp/mcp.schemas";
import { IngredientMeasurementValidationError } from "@/features/recipes/ingredient-measurements";
import { createTestDb } from "@/test/d1";
import { editMcpRecipe } from "./edit-recipe";
import { RecipeNotFoundError } from "./recipe-errors";

function createFakeDb(found = true) {
  const updates: unknown[] = [];
  const deletes: unknown[] = [];
  const inserts: { table: unknown; values: unknown }[] = [];
  const batch = vi.fn(async () => undefined);
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (found ? [{ id: "recipe-1" }] : []),
          orderBy: async () => [{ quantity: 1, unit: "CUP", displayText: "stock" }],
        }),
      }),
    }),
    update(table: unknown) {
      return {
        set(values: unknown) {
          updates.push({ table, values });
          return {
            where: () => ({ type: "update", table, values }),
          };
        },
      };
    },
    delete(table: unknown) {
      return {
        where: () => {
          deletes.push(table);
          return { type: "delete", table };
        },
      };
    },
    insert(table: unknown) {
      return {
        values(values: unknown) {
          inserts.push({ table, values });
          return { type: "insert", table, values };
        },
      };
    },
    batch,
  };
  return { db: db as never, batch, updates, deletes, inserts };
}

const databases: DatabaseSync[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const sqlite of databases.splice(0)) sqlite.close();
});

async function createStoredRecipe(amount: { quantity: number | null; unit: IngredientUnit | null }) {
  const test = createTestDb();
  databases.push(test.sqlite);
  test.sqlite.exec(`INSERT INTO user (id, name, email, createdAt, updatedAt)
    VALUES ('cook', 'Cook', 'cook@example.test', 1, 1)`);
  await test.db.insert(recipe).values({ id: "recipe-1", userId: "cook", title: "Soup", notes: "Keep this note." });
  await test.db.insert(recipeIngredient).values({
    recipeId: "recipe-1",
    ...amount,
    displayText: "salt to taste",
    rawText: "  Salt to taste  ",
    sortOrder: 0,
  });
  await test.db.insert(recipeInstruction).values({ recipeId: "recipe-1", text: "Season.", sortOrder: 0 });
  return test;
}

describe("editMcpRecipe", () => {
  it("updates only supplied metadata and always refreshes the timestamp", async () => {
    const { db, batch, updates, deletes, inserts } = createFakeDb();

    const result = await editMcpRecipe(db, "user-1", {
      recipeId: "recipe-1",
      servings: null,
      notes: null,
    });

    expect(result).toEqual({ recipeId: "recipe-1" });
    expect(batch).toHaveBeenCalledOnce();
    expect(updates).toEqual([
      {
        table: recipe,
        values: { servings: null, notes: null, updatedAt: expect.any(Date) },
      },
    ]);
    expect(deletes).toEqual([]);
    expect(inserts).toEqual([]);
  });

  it("replaces supplied ingredient and instruction lists in order", async () => {
    const { db, batch, deletes, inserts } = createFakeDb();

    await editMcpRecipe(db, "user-1", {
      recipeId: "recipe-1",
      ingredients: [
        { quantity: 1, unit: "CUP", displayText: "stock" },
        { quantity: 2, unit: "COUNT", displayText: "tomatoes", rawText: "diced tomatoes" },
      ],
      instructions: ["Combine", "Simmer"],
    });

    expect(batch).toHaveBeenCalledOnce();
    expect(deletes).toEqual([recipeInstruction, recipeIngredient]);
    expect(inserts).toEqual([
      {
        table: recipeInstruction,
        values: [
          { recipeId: "recipe-1", sortOrder: 0, text: "Combine" },
          { recipeId: "recipe-1", sortOrder: 1, text: "Simmer" },
        ],
      },
      {
        table: recipeIngredient,
        values: [
          {
            recipeId: "recipe-1",
            ingredientId: null,
            quantity: 1,
            unit: "CUP",
            displayText: "stock",
            rawText: null,
            sortOrder: 0,
          },
          {
            recipeId: "recipe-1",
            ingredientId: null,
            quantity: 2,
            unit: "COUNT",
            displayText: "tomatoes",
            rawText: "diced tomatoes",
            sortOrder: 1,
          },
        ],
      },
    ]);
  });

  it("does not write when the recipe is not owned by the user", async () => {
    const { db, batch } = createFakeDb(false);

    await expect(
      editMcpRecipe(db, "user-1", { recipeId: "recipe-1", title: "Other" }),
    ).rejects.toBeInstanceOf(RecipeNotFoundError);
    expect(batch).not.toHaveBeenCalled();
  });

  it.each([
    { quantity: null, unit: "TSP" as const },
    { quantity: 1, unit: null },
    { quantity: null, unit: null },
  ])("blocks every partial edit write for incomplete stored measurements: %o", async (amount) => {
    const { db } = await createStoredRecipe(amount);
    const before = {
      recipes: await db.select().from(recipe),
      ingredients: await db.select().from(recipeIngredient),
      instructions: await db.select().from(recipeInstruction),
    };
    const batch = vi.spyOn(db, "batch");
    const update = vi.spyOn(db, "update");
    const remove = vi.spyOn(db, "delete");

    const result = editMcpRecipe(db, "cook", {
      recipeId: "recipe-1",
      title: "Changed",
      notes: "Changed note",
      instructions: ["Changed instruction"],
    });
    await expect(result).rejects.toBeInstanceOf(IngredientMeasurementValidationError);
    await expect(result).rejects.toThrow(/Ingredient 1 "salt to taste"/);

    expect(batch).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(await db.select().from(recipe)).toEqual(before.recipes);
    expect(await db.select().from(recipeIngredient)).toEqual(before.ingredients);
    expect(await db.select().from(recipeInstruction)).toEqual(before.instructions);
  });

  it.each([
    {},
    { quantity: 1 },
    { unit: "TSP" },
    { quantity: null, unit: null },
    { quantity: -1, unit: "TSP" },
    { quantity: Number.POSITIVE_INFINITY, unit: "TSP" },
    { quantity: 1, unit: "ML" },
  ])("rejects invalid direct replacements without changing the recipe: %o", async (amount) => {
    const { db } = await createStoredRecipe({ quantity: 1, unit: "TSP" });
    const before = await db.select().from(recipeIngredient);
    const batch = vi.spyOn(db, "batch");

    await expect(editMcpRecipe(db, "cook", {
      recipeId: "recipe-1",
      title: "Changed",
      ingredients: [{ displayText: "salt to taste", ...amount }],
      instructions: ["Changed instruction"],
    } as unknown as EditRecipeToolInput)).rejects.toBeInstanceOf(IngredientMeasurementValidationError);

    expect(batch).not.toHaveBeenCalled();
    expect(await db.select().from(recipeIngredient)).toEqual(before);
    expect(await db.select().from(recipe)).toMatchObject([{ title: "Soup" }]);
    expect(await db.select().from(recipeInstruction)).toMatchObject([{ text: "Season." }]);
  });

  it("repairs incomplete legacy ingredients and permits later partial edits", async () => {
    const { db } = await createStoredRecipe({ quantity: null, unit: null });
    await editMcpRecipe(db, "cook", {
      recipeId: "recipe-1",
      title: "Measured soup",
      ingredients: [{
        quantity: 1 / 3,
        unit: "TSP",
        displayText: "salt to taste",
        rawText: "  Salt to taste  ",
      }],
    });
    await editMcpRecipe(db, "cook", { recipeId: "recipe-1", notes: "Repaired." });

    expect(await db.select().from(recipe)).toMatchObject([{ title: "Measured soup", notes: "Repaired." }]);
    expect(await db.select().from(recipeIngredient)).toMatchObject([{
      quantity: 1 / 3,
      unit: "TSP",
      displayText: "salt to taste",
      rawText: "  Salt to taste  ",
      ingredientId: null,
    }]);
    expect(await db.select().from(recipeInstruction)).toMatchObject([{ text: "Season." }]);
  });
});
