import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionAPIContext } from "astro:actions";
import { eq } from "drizzle-orm";
import { ingredient, recipe, recipeIngredient, recipeInstruction, recipeTag, tag, type Db } from "@/db";
import type { IngredientUnit } from "@/db/schema/enums";
import { createTestDb } from "@/test/d1";
import { ingredientMapping } from "./ingredient-mapping";
import { recipeImport } from "./import";
import { recipeIngredients } from "./recipe-ingredients";
import { recipes } from "./recipes";

const runtime = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  env: { DB: undefined as D1Database | undefined },
  queueSearchSync: vi.fn(async () => undefined),
}));

vi.mock("astro:actions", async () => {
  const { defineAction } = await import("../../node_modules/astro/dist/actions/runtime/server.js");
  const { ActionError } = await import("../../node_modules/astro/dist/actions/runtime/client.js");
  return { defineAction, ActionError };
});
vi.mock("cloudflare:workers", () => ({ env: runtime.env }));
vi.mock("./_shared", () => ({
  getDb: () => runtime.db,
  requireUser: (ctx: { locals: { user: { id: string } } }) => ctx.locals.user,
  queueSearchSync: runtime.queueSearchSync,
}));

let test: ReturnType<typeof createTestDb>;
const ctx = {
  [Symbol.for("astro.actionAPIContext")]: true,
  locals: { user: { id: "cook" } },
} as unknown as ActionAPIContext;

beforeEach(() => {
  test = createTestDb();
  runtime.db = test.db;
  runtime.env.DB = test.binding;
  runtime.queueSearchSync.mockClear();
  test.sqlite.exec(`INSERT INTO user (id, name, email, createdAt, updatedAt)
    VALUES ('cook', 'Cook', 'cook@example.test', 1, 1)`);
});
afterEach(() => {
  vi.restoreAllMocks();
  test.sqlite.close();
});

function snapshot() {
  return {
    recipes: test.sqlite.prepare('SELECT * FROM "Recipe"').all(),
    ingredients: test.sqlite.prepare('SELECT * FROM "RecipeIngredient"').all(),
    instructions: test.sqlite.prepare('SELECT * FROM "RecipeInstruction"').all(),
    tags: test.sqlite.prepare('SELECT * FROM "RecipeTag"').all(),
    catalog: test.sqlite.prepare('SELECT * FROM "Ingredient"').all(),
  };
}

async function seedRecipe(amount: { quantity: number; unit: IngredientUnit }) {
  await test.db.insert(recipe).values({ id: "legacy", userId: "cook", title: "Soup", notes: "Keep this note." });
  const [row] = await test.db.insert(recipeIngredient).values({
    id: "row-1",
    recipeId: "legacy",
    displayText: "salt to taste",
    rawText: "  Salt to taste  ",
    ...amount,
    sortOrder: 0,
  }).returning();
  await test.db.insert(recipeInstruction).values({ recipeId: "legacy", text: "Season.", sortOrder: 0 });
  await test.db.insert(tag).values({ id: "tag-1", userId: "cook", name: "Soup" });
  await test.db.insert(recipeTag).values({ recipeId: "legacy", tagId: "tag-1" });
  return row!;
}

const invalidMeasurements = [
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
];

describe("recipe measurement actions", () => {
  it("enforces quantity and unit as required database fields", async () => {
    await test.db.insert(recipe).values({ id: "required", userId: "cook", title: "Soup" });

    expect(() => test.sqlite.prepare(`
      INSERT INTO RecipeIngredient (id, recipeId, quantity, unit, displayText, sortOrder)
      VALUES ('missing-quantity', 'required', NULL, 'TSP', 'salt', 0)
    `).run()).toThrow(/NOT NULL constraint failed/i);
    expect(() => test.sqlite.prepare(`
      INSERT INTO RecipeIngredient (id, recipeId, quantity, unit, displayText, sortOrder)
      VALUES ('missing-unit', 'required', 1, NULL, 'salt', 0)
    `).run()).toThrow(/NOT NULL constraint failed/i);
  });

  it.each(invalidMeasurements)("rejects manual create, update, and replacement before writes: %o", async (amount) => {
    await seedRecipe({ quantity: 1, unit: "TSP" });
    const before = snapshot();
    const item = { displayText: "salt to taste", sortOrder: 0, ...amount };
    const create = await recipes.create.bind(ctx)({
      title: "Rejected soup",
      instructions: ["New instruction"],
      ingredientsStructured: [item],
    } as never);
    const update = await recipes.update.bind(ctx)({
      id: "legacy",
      title: "Rejected soup",
      instructions: ["New instruction"],
      tagIds: [],
      ingredientsStructured: [item],
    } as never);
    const replace = await recipeIngredients.set.bind(ctx)({
      recipeId: "legacy",
      items: [item],
    } as never);

    for (const result of [create, update, replace]) {
      expect(result.error).toMatchObject({ code: "BAD_REQUEST" });
      expect(result.error?.message).toMatch(/quantity|unit/i);
      expect(result.error?.message).toMatch(/ingredientsStructured|items/);
    }
    expect(snapshot()).toEqual(before);
    expect(runtime.queueSearchSync).not.toHaveBeenCalled();
  });

  it("allows partial edits and duplication with complete stored measurements", async () => {
    await seedRecipe({ quantity: 1, unit: "TSP" });
    const result = await recipes.update.bind(ctx)({
      id: "legacy",
      title: "Changed",
      notes: "Changed note",
    });
    const form = new FormData();
    form.set("recipeId", "legacy");
    const duplicate = await recipes.duplicate.bind(ctx)(form);

    expect(result.error).toBeUndefined();
    expect(duplicate.error).toBeUndefined();
    expect(await test.db.select().from(recipeIngredient).where(eq(recipeIngredient.recipeId, duplicate.data!.id)))
      .toMatchObject([{ quantity: 1, unit: "TSP", displayText: "salt to taste" }]);
    expect(runtime.queueSearchSync).toHaveBeenCalled();
  });

  it("saves measured mapped and unmapped ingredients with original text and precision", async () => {
    await test.db.insert(ingredient).values({
      id: "salt", userId: "cook", name: "Salt", normalizedName: "salt", costBasisUnit: "G",
    });
    const result = await recipes.create.bind(ctx)({
      title: "Soup",
      instructions: ["Season."],
      ingredientsStructured: [
        { ingredientId: "salt", quantity: 1 / 3, unit: "TSP", displayText: "salt to taste", rawText: "  Salt to taste  ", sortOrder: 0 },
        { quantity: 0, unit: "PINCH", displayText: "pepper", sortOrder: 1 },
        { quantity: 3, unit: "COUNT", displayText: "eggs", sortOrder: 2 },
      ],
    });

    expect(result.error).toBeUndefined();
    expect(await test.db.select().from(recipeIngredient).orderBy(recipeIngredient.sortOrder)).toMatchObject([
      { ingredientId: "salt", quantity: 1 / 3, unit: "TSP", displayText: "salt to taste", rawText: "  Salt to taste  " },
      { ingredientId: null, quantity: 0, unit: "PINCH", displayText: "pepper" },
      { ingredientId: null, quantity: 3, unit: "COUNT", displayText: "eggs" },
    ]);
  });

  it("replaces measurements, then allows partial edits and duplication", async () => {
    await seedRecipe({ quantity: 1, unit: "TSP" });
    const repaired = await recipes.update.bind(ctx)({
      id: "legacy",
      ingredientsStructured: [{ quantity: 1 / 3, unit: "TSP", displayText: "salt to taste", rawText: "  Salt to taste  ", sortOrder: 0 }],
    });
    expect(repaired.error).toBeUndefined();
    expect((await recipes.update.bind(ctx)({ id: "legacy", notes: "Measured." })).error).toBeUndefined();
    const form = new FormData();
    form.set("recipeId", "legacy");
    const duplicate = await recipes.duplicate.bind(ctx)(form);
    expect(duplicate.error).toBeUndefined();
    expect(await test.db.select().from(recipeIngredient).where(eq(recipeIngredient.recipeId, duplicate.data!.id)))
      .toMatchObject([{ quantity: 1 / 3, unit: "TSP", displayText: "salt to taste", rawText: "  Salt to taste  " }]);
    expect(await test.db.select().from(recipeInstruction).where(eq(recipeInstruction.recipeId, duplicate.data!.id)))
      .toMatchObject([{ text: "Season." }]);
  });

  it("replaces complete measurements through the ingredient replacement action", async () => {
    await seedRecipe({ quantity: 1, unit: "TSP" });
    const result = await recipeIngredients.set.bind(ctx)({
      recipeId: "legacy",
      items: [{ quantity: 2, unit: "TBSP", displayText: "salt to taste", rawText: "  Salt to taste  ", sortOrder: 0 }],
    });
    expect(result.error).toBeUndefined();
    expect(await test.db.select().from(recipeIngredient)).toMatchObject([{
      quantity: 2, unit: "TBSP", displayText: "salt to taste", rawText: "  Salt to taste  ", ingredientId: null,
    }]);
  });

  it("allows deleting a recipe with complete measurements", async () => {
    await seedRecipe({ quantity: 1, unit: "TSP" });
    const form = new FormData();
    form.set("id", "legacy");
    expect((await recipes.delete.bind(ctx)(form)).error).toBeUndefined();
    expect(await test.db.select().from(recipe)).toEqual([]);
    expect(await test.db.select().from(recipeIngredient)).toEqual([]);
  });

  it("returns BAD_REQUEST for unresolved raw imports without creating a partial recipe", async () => {
    const before = snapshot();
    const result = await recipeImport.saveTextOnly.bind(ctx)({
      recipe: { title: "Soup", instructions: ["Season."] },
      ingredients: ["1 cup stock", "Salt to taste"],
    });
    expect(result.error).toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringMatching(/Ingredient 2 "Salt to taste".*Quantity.*Unit/),
    });
    expect(snapshot()).toEqual(before);
    expect(runtime.queueSearchSync).not.toHaveBeenCalled();
  });

  it.each(invalidMeasurements)("rejects invalid structured import measurements: %o", async (amount) => {
    const before = snapshot();
    const recipeData = { title: "Soup", instructions: ["Season."] };
    const textOnly = await recipeImport.saveTextOnly.bind(ctx)({
      recipe: recipeData,
      ingredients: [{ displayText: "salt to taste", rawText: "Salt to taste", ...amount }],
    } as never);
    const mapped = await recipeImport.saveWithMappings.bind(ctx)({
      recipe: recipeData,
      ingredientLines: [{ originalLine: "1 tsp salt", createName: "Salt", sortOrder: 0, ...amount }],
    } as never);

    expect(textOnly.error).toMatchObject({ code: "BAD_REQUEST" });
    expect(mapped.error).toMatchObject({ code: "BAD_REQUEST" });
    expect(snapshot()).toEqual(before);
    expect(runtime.queueSearchSync).not.toHaveBeenCalled();
  });

  it("saves reviewed URL or photo import measurements without reparsing them", async () => {
    const result = await recipeImport.saveTextOnly.bind(ctx)({
      recipe: { title: "Soup", instructions: ["Season."] },
      ingredients: [{ displayText: "salt to taste", rawText: "  Salt to taste  ", quantity: 1, unit: "TSP" }],
    });
    expect(result.error).toBeUndefined();
    expect(await test.db.select().from(recipeIngredient)).toMatchObject([{
      ingredientId: null, quantity: 1, unit: "TSP", displayText: "salt to taste", rawText: "  Salt to taste  ",
    }]);
  });

  it.each([
    { kind: "existing", ingredientId: "salt" },
    { kind: "create", name: "Salt" },
    { kind: "unmapped" },
  ])("rejects incomplete or invalid measurements on $kind mapping Apply before writes", async (mapping) => {
    const row = await seedRecipe({ quantity: 1, unit: "TSP" });
    const before = snapshot();
    const batch = vi.spyOn(test.binding, "batch");

    for (const amount of invalidMeasurements) {
      const result = await ingredientMapping.applyRecipe.bind(ctx)({
        recipeId: "legacy",
        items: [{ recipeIngredientId: row.id, recipeIngredientUpdatedAt: row.updatedAt.getTime(), displayText: "salt to taste", mapping, ...amount }],
      } as never);
      expect(result.error).toMatchObject({ code: "BAD_REQUEST" });
      expect(result.error?.message).toMatch(/quantity|unit/i);
    }

    expect(batch).not.toHaveBeenCalled();
    expect(snapshot()).toEqual(before);
    expect(runtime.queueSearchSync).not.toHaveBeenCalled();
  });

  it.each([
    { kind: "existing", ingredientId: "salt" },
    { kind: "create", name: "Salt" },
    { kind: "unmapped" },
  ] as const)("updates measurements with $kind mapping Apply", async (mapping) => {
    const row = await seedRecipe({ quantity: 1, unit: "TSP" });
    if (mapping.kind === "existing") {
      await test.db.insert(ingredient).values({ id: "salt", userId: "cook", name: "Salt", normalizedName: "salt", costBasisUnit: "G" });
    }
    const result = await ingredientMapping.applyRecipe.bind(ctx)({
      recipeId: "legacy",
      items: [{
        recipeIngredientId: row.id,
        recipeIngredientUpdatedAt: row.updatedAt.getTime(),
        displayText: "salt to taste",
        quantity: 1 / 3,
        unit: "TSP",
        mapping,
      }],
    });

    expect(result.error).toBeUndefined();
    const [updated] = await test.db.select().from(recipeIngredient);
    expect(updated).toMatchObject({ quantity: 1 / 3, unit: "TSP", displayText: "salt to taste", rawText: "  Salt to taste  " });
    expect(updated!.ingredientId).toEqual(mapping.kind === "unmapped" ? null : expect.any(String));
    expect(updated!.updatedAt.getTime()).toBeGreaterThan(row.updatedAt.getTime());
  });

  it("keeps mapping version checks before any catalog or recipe changes", async () => {
    const row = await seedRecipe({ quantity: 1, unit: "TSP" });
    const before = snapshot();
    const result = await ingredientMapping.applyRecipe.bind(ctx)({
      recipeId: "legacy",
      items: [{
        recipeIngredientId: row.id,
        recipeIngredientUpdatedAt: row.updatedAt.getTime() - 1,
        displayText: "salt to taste",
        quantity: 1,
        unit: "TSP",
        mapping: { kind: "create", name: "Salt" },
      }],
    });
    expect(result.error).toMatchObject({ code: "CONFLICT" });
    expect(snapshot()).toEqual(before);
  });
});
