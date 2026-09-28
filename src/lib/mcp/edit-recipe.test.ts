import { describe, expect, it, vi } from "vitest";
import { recipe, recipeIngredient, recipeInstruction } from "@/db";
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
        { displayText: "tomatoes", rawText: "diced tomatoes" },
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
            quantity: null,
            unit: null,
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
});
