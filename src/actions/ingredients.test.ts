import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionAPIContext } from "astro:actions";
import { eq } from "drizzle-orm";
import { ingredient, type Db } from "@/db";
import { createTestDb } from "@/test/d1";
import { buildGroceryList } from "@/lib/grocery/aggregate";
import { ingredients } from "./ingredients";

const runtime = vi.hoisted(() => ({ db: undefined as Db | undefined }));

vi.mock("astro:actions", async () => {
  const { defineAction } = await import("../../node_modules/astro/dist/actions/runtime/server.js");
  const { ActionError } = await import("../../node_modules/astro/dist/actions/runtime/client.js");
  return { defineAction, ActionError };
});
vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("./_shared", async (importOriginal) => ({
  ...await importOriginal<typeof import("./_shared")>(),
  getDb: () => runtime.db,
  queueSearchSync: vi.fn(async () => undefined),
}));

let test: ReturnType<typeof createTestDb>;
const ctx = {
  [Symbol.for("astro.actionAPIContext")]: true,
  locals: { user: { id: "cook", role: "USER" } },
} as unknown as ActionAPIContext;

const base = {
  name: "Eggs",
  purchasePrice: "4",
  purchaseQuantity: "12",
  purchaseUnit: "COUNT",
  volumeAmount: "1",
  volumeUnit: "CUP",
  volumeWeightGrams: "240",
};

function form(values: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ ...base, ...values })) data.set(key, value);
  return data;
}

async function saved(id: string) {
  return (await test.db.select().from(ingredient).where(eq(ingredient.id, id)))[0]!;
}

beforeEach(() => {
  test = createTestDb();
  runtime.db = test.db;
  test.sqlite.exec(`INSERT INTO user (id, name, email, createdAt, updatedAt)
    VALUES ('cook', 'Cook', 'cook@example.test', 1, 1), ('other', 'Other', 'other@example.test', 1, 1)`);
});
afterEach(() => test.sqlite.close());

describe("ingredient package pricing actions", () => {
  it.each([
    ["1.10", "12", 110],
    ["2.20", "12", 220],
    ["1.10", "25", 110],
    ["2.20", "25", 220],
    ["7.99", "21", 799],
    ["0.07", "25", 7],
    ["0.29", "7", 29],
  ])("preserves a $%s package of %s when all items are used", async (price, quantity, cents) => {
    const result = await ingredients.create.bind(ctx)(form({ purchasePrice: String(price), purchaseQuantity: String(quantity) }));

    expect(result.error).toBeUndefined();
    const row = await saved(result.data!.id);
    expect(row.purchasePriceCents).toBe(cents);
    expect(row.estimatedCentsPerBasisUnit).toBe(Number(cents) / Number(quantity));
    const grocery = buildGroceryList({
      orderItems: [{ recipeId: "whole-package", batches: 1 }],
      recipes: [{ id: "whole-package", title: "Whole package", ingredients: [
        { id: "line", ingredientId: row.id, ingredient: row, quantity: Number(quantity), unit: "COUNT", displayText: "Whole package" },
      ] }],
    });

    expect(grocery.totalEstimatedCostCents).toBe(cents);
    expect(grocery.totals[0]?.estimatedCostCents).toBe(cents);
  });

  it("stores the purchase and derives fractional count cost without an item weight", async () => {
    const result = await ingredients.create.bind(ctx)(form({ estimatedCentsPerBasisUnit: "999" }));

    expect(result.error).toBeUndefined();
    expect(await saved(result.data!.id)).toMatchObject({
      purchasePriceCents: 400,
      purchaseQuantity: 12,
      purchaseUnit: "COUNT",
      costBasisUnit: "COUNT",
      estimatedCentsPerBasisUnit: 400 / 12,
      volumeAmount: 1,
      volumeUnit: "CUP",
      volumeWeightGrams: 240,
      gramsPerCup: 240,
      gramsPerEach: null,
      preferredDisplayUnit: "AUTO",
    });
  });

  it("preserves a quarter-cup serving and fractional cents per gram", async () => {
    const result = await ingredients.create.bind(ctx)(form({
      name: "Flour",
      purchasePrice: "7.99",
      purchaseQuantity: "2000",
      purchaseUnit: "G",
      volumeAmount: "0.25",
      volumeWeightGrams: "30",
      preferredDisplayUnit: "LB",
    }));

    expect(result.error).toBeUndefined();
    expect(await saved(result.data!.id)).toMatchObject({
      purchasePriceCents: 799,
      purchaseQuantity: 2000,
      purchaseUnit: "G",
      estimatedCentsPerBasisUnit: 799 / 2000,
      volumeAmount: 0.25,
      volumeWeightGrams: 30,
      gramsPerCup: 120,
      preferredDisplayUnit: "LB",
    });
  });

  it("recalculates changed measurements and pricing, and clears optional item weight", async () => {
    await test.db.insert(ingredient).values({
      id: "eggs", userId: "cook", name: "Eggs", normalizedName: "eggs", costBasisUnit: "G",
      defaultUnit: "TSP", gramsPerEach: 50,
    });
    const result = await ingredients.update.bind(ctx)(form({
      id: "eggs", purchasePrice: "9.99", purchaseQuantity: "12", purchaseUnit: "OZ",
      volumeAmount: "2", volumeUnit: "TBSP", volumeWeightGrams: "12", gramsPerEach: "",
      preferredDisplayUnit: "GRAM",
    }));

    expect(result.error).toBeUndefined();
    expect(await saved("eggs")).toMatchObject({
      purchasePriceCents: 999,
      costBasisUnit: "OZ",
      estimatedCentsPerBasisUnit: 999 / 12,
      gramsPerCup: 96,
      gramsPerEach: null,
      defaultUnit: "TSP",
      preferredDisplayUnit: "GRAM",
    });
  });

  it("rejects incomplete create and update submissions before changing data", async () => {
    await test.db.insert(ingredient).values({
      id: "eggs", userId: "cook", name: "Eggs", normalizedName: "eggs", costBasisUnit: "COUNT",
    });
    const before = await test.db.select().from(ingredient);

    for (const field of ["purchasePrice", "purchaseQuantity", "volumeAmount", "volumeWeightGrams"]) {
      expect((await ingredients.create.bind(ctx)(form({ name: "New", [field]: "" }))).error?.code).toBe("BAD_REQUEST");
      expect((await ingredients.update.bind(ctx)(form({ id: "eggs", [field]: "" }))).error?.code).toBe("BAD_REQUEST");
    }
    expect(await test.db.select().from(ingredient)).toEqual(before);
  });

  it("prefills global purchase and serving measurements", async () => {
    await test.db.insert(ingredient).values({
      id: "base", name: "Flour", normalizedName: "flour", costBasisUnit: "LB",
      purchasePriceCents: 399, purchaseQuantity: 3, purchaseUnit: "LB",
      volumeAmount: 0.25, volumeUnit: "CUP", volumeWeightGrams: 30, gramsPerCup: 120,
      gramsPerEach: null, preferredDisplayUnit: "LB", subcategory: "Flour",
    });
    const prefill = await ingredients.getGlobalBasePrefill.bind(ctx)({ id: "base" });
    expect(prefill.data).toMatchObject({
      purchasePriceCents: 399, purchaseQuantity: 3, purchaseUnit: "LB",
      volumeAmount: 0.25, volumeUnit: "CUP", volumeWeightGrams: 30, gramsPerCup: 120,
      preferredDisplayUnit: "LB",
    });
    const result = await ingredients.create.bind(ctx)(form({ name: "My flour", baseIngredientId: "base" }));
    expect(result.error).toBeUndefined();
    expect(await saved(result.data!.id)).toMatchObject({ userId: "cook", baseIngredientId: "base", subcategory: "Flour" });
  });

  it("does not expose another user's ingredient through global prefill", async () => {
    await test.db.insert(ingredient).values({
      id: "private", userId: "other", name: "Flour", normalizedName: "flour", costBasisUnit: "G",
    });
    expect((await ingredients.getGlobalBasePrefill.bind(ctx)({ id: "private" })).error?.code).toBe("NOT_FOUND");
    expect((await ingredients.update.bind(ctx)(form({ id: "private" }))).error?.code).toBe("FORBIDDEN");
  });

  it("protects global edits and allows an admin to save complete pricing", async () => {
    await test.db.insert(ingredient).values({ id: "global", name: "Eggs", normalizedName: "eggs", costBasisUnit: "G" });
    expect((await ingredients.update.bind(ctx)(form({ id: "global" }))).error?.code).toBe("FORBIDDEN");
    const admin = { ...ctx, locals: { user: { id: "cook", role: "ADMIN" } } } as unknown as ActionAPIContext;
    expect((await ingredients.update.bind(admin)(form({ id: "global" }))).error).toBeUndefined();
    expect(await saved("global")).toMatchObject({ userId: null, purchasePriceCents: 400, gramsPerCup: 240 });
  });

  it("keeps import name-only creation compatible without inventing purchase data", async () => {
    const data = new FormData();
    data.set("name", "Imported ingredient");
    const result = await ingredients.upsertFromName.bind(ctx)(data);
    expect(result.error).toBeUndefined();
    expect(await saved(result.data!.id)).toMatchObject({ purchasePriceCents: null, gramsPerCup: null, gramsPerEach: null });
  });

  it("costs mixed recipe measurements using the saved package and item weight", async () => {
    const result = await ingredients.create.bind(ctx)(form({ gramsPerEach: "50", volumeWeightGrams: "200" }));
    const row = await saved(result.data!.id);
    const grocery = buildGroceryList({
      orderItems: [{ recipeId: "breakfast", batches: 1 }],
      recipes: [{ id: "breakfast", title: "Breakfast", ingredients: [
        { id: "count", ingredientId: row.id, ingredient: row, quantity: 2, unit: "COUNT", displayText: "2 eggs" },
        { id: "volume", ingredientId: row.id, ingredient: row, quantity: 0.5, unit: "CUP", displayText: "1/2 cup eggs" },
        { id: "weight", ingredientId: row.id, ingredient: row, quantity: 100, unit: "G", displayText: "100 g eggs" },
      ] }],
    });

    expect(grocery.totals).toMatchObject([{ totalBasisQty: 6, estimatedCostCents: 200, purchaseUnit: "COUNT", gramsPerEach: 50 }]);
    expect(grocery.issues.cannotConvert).toEqual([]);
  });

  it("does not round fractional per-gram prices to free ingredients", async () => {
    const result = await ingredients.create.bind(ctx)(form({ purchasePrice: "7.99", purchaseQuantity: "2000", purchaseUnit: "G" }));
    const row = await saved(result.data!.id);
    const grocery = buildGroceryList({
      orderItems: [{ recipeId: "bread", batches: 1 }],
      recipes: [{ id: "bread", title: "Bread", ingredients: [
        { id: "flour", ingredientId: row.id, ingredient: row, quantity: 100, unit: "G", displayText: "100 g flour" },
      ] }],
    });

    expect(grocery.totalEstimatedCostCents).toBe(40);
  });
});
