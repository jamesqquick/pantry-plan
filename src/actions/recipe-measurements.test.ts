import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionAPIContext } from "astro:actions";
import { eq } from "drizzle-orm";
import { ingredient, recipe, recipeIngredient, recipeInstruction, recipeTag, tag, type Db } from "@/db";
import type { IngredientUnit } from "@/db/schema/enums";
import { createTestDb } from "@/test/d1";
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
  vi.useRealTimers();
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
      accountId: "cook",
      operationId: crypto.randomUUID(),
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
    form.set("operationId", crypto.randomUUID());
    form.set("accountId", "cook");
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
      accountId: "cook",
      operationId: crypto.randomUUID(),
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
    form.set("operationId", crypto.randomUUID());
    form.set("accountId", "cook");
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
      accountId: "cook",
      operationId: crypto.randomUUID(),
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
      accountId: "cook",
      operationId: crypto.randomUUID(),
      recipe: recipeData,
      ingredients: [{ displayText: "salt to taste", rawText: "Salt to taste", ...amount }],
    } as never);
    const mapped = await recipeImport.saveWithMappings.bind(ctx)({
      accountId: "cook",
      operationId: crypto.randomUUID(),
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
      accountId: "cook",
      operationId: crypto.randomUUID(),
      recipe: { title: "Soup", instructions: ["Season."] },
      ingredients: [{ displayText: "salt to taste", rawText: "  Salt to taste  ", quantity: 1, unit: "TSP" }],
    });
    expect(result.error).toBeUndefined();
    expect(await test.db.select().from(recipeIngredient)).toMatchObject([{
      ingredientId: null, quantity: 1, unit: "TSP", displayText: "salt to taste", rawText: "  Salt to taste  ",
    }]);
  });

  it("saves imported catalog selections and new catalog ingredients with their reviewed fields", async () => {
    await test.db.insert(ingredient).values({
      id: "flour-id",
      userId: null,
      name: "Flour",
      normalizedName: "flour",
      costBasisUnit: "G",
    });
    const result = await recipeImport.saveWithMappings.orThrow.call(ctx, {
      accountId: "cook",
      operationId: crypto.randomUUID(),
      recipe: { title: "Pasta", instructions: ["Mix and cook."] },
      ingredientLines: [
        {
          originalLine: "2 cups flour",
          displayText: "bread flour",
          ingredientId: "flour-id",
          quantity: 2,
          unit: "CUP",
          sortOrder: 0,
        },
        {
          originalLine: "1 tbsp fresh herbs",
          displayText: "fresh herbs",
          createName: "Fresh herbs",
          quantity: 1,
          unit: "TBSP",
          sortOrder: 1,
        },
      ],
    });

    const savedRows = await test.db
      .select()
      .from(recipeIngredient)
      .where(eq(recipeIngredient.recipeId, result.recipeId))
      .orderBy(recipeIngredient.sortOrder);
    expect(savedRows).toMatchObject([
      {
        ingredientId: "flour-id",
        displayText: "bread flour",
        rawText: "2 cups flour",
        quantity: 2,
        unit: "CUP",
        originalQuantity: 2,
        originalUnit: "CUP",
        sortOrder: 0,
      },
      {
        displayText: "fresh herbs",
        rawText: "1 tbsp fresh herbs",
        quantity: 1,
        unit: "TBSP",
        originalQuantity: 1,
        originalUnit: "TBSP",
        sortOrder: 1,
      },
    ]);
    expect(savedRows[1]!.ingredientId).toBeTruthy();
    expect(test.sqlite.prepare('SELECT normalizedName FROM "Ingredient" WHERE normalizedName = ?').get("fresh herbs"))
      .toEqual({ normalizedName: "fresh herbs" });
  });

  it.each([
    { units: ["COUNT"], basis: "COUNT" },
    { units: ["CUP", "TBSP"], basis: "CUP" },
    { units: ["COUNT", "G"], basis: "G" },
  ] as const)("infers $basis for imported ingredient units $units", async ({ units, basis }) => {
    const result = await recipeImport.saveWithMappings.bind(ctx)({
      accountId: "cook",
      operationId: crypto.randomUUID(),
      recipe: { title: "Imported", instructions: ["Mix."] },
      ingredientLines: units.map((unit, sortOrder) => ({ originalLine: `1 ${unit.toLowerCase()} imported ingredient`, createName: "Imported ingredient", quantity: 1, unit, sortOrder })),
    });
    expect(result.error).toBeUndefined();
    expect(await test.db.select().from(ingredient)).toMatchObject([{ costBasisUnit: basis, purchasePriceCents: null, gramsPerCup: null }]);
  });

  it.each([{ ingredientId: "eggs" }, { createName: "Eggs" }])("uses saved item weight for imported mapping %o", async (mapping) => {
    await test.db.insert(ingredient).values({
      id: "eggs", userId: "cook", name: "Eggs", normalizedName: "eggs", costBasisUnit: "COUNT", gramsPerEach: 50,
    });
    const result = await recipeImport.saveWithMappings.bind(ctx)({
      accountId: "cook",
      operationId: crypto.randomUUID(),
      recipe: { title: "Breakfast", instructions: ["Cook."] },
      ingredientLines: [{ originalLine: "2 eggs", quantity: 2, unit: "COUNT", sortOrder: 0, ...mapping }],
    });
    expect(result.error).toBeUndefined();
    expect(await test.db.select().from(recipeIngredient)).toMatchObject([{ ingredientId: "eggs", weightGrams: 100, conversionSource: "AUTO" }]);
  });

});
