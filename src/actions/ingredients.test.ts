import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionAPIContext } from "astro:actions";
import { eq } from "drizzle-orm";
import { ingredient, type Db } from "@/db";
import { createTestDb } from "@/test/d1";
import { buildGroceryList } from "@/lib/grocery/aggregate";
import { OPTIONAL_FIELD_CLEAR_SENTINEL } from "@/features/ingredients/ingredients.schemas";
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

function partialForm(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

async function saved(id: string) {
  return (await test.db.select().from(ingredient).where(eq(ingredient.id, id)))[0]!;
}

async function seedLegacyIngredient() {
  await test.db.insert(ingredient).values({
    id: "global-base", name: "Base", normalizedName: "base", costBasisUnit: "LB",
  });
  await test.db.insert(ingredient).values({
    id: "legacy", userId: "cook", baseIngredientId: "global-base", name: "Legacy", normalizedName: "legacy",
    category: "Pantry", defaultUnit: "TSP", costBasisUnit: "LB", estimatedCentsPerBasisUnit: 0.4,
    gramsPerCup: 120, gramsPerEach: 50, preferredDisplayUnit: "LB", notes: "Keep airtight.",
  });
}

async function seedCompleteIngredient() {
  await test.db.insert(ingredient).values({
    id: "eggs", userId: "cook", name: "Eggs", normalizedName: "eggs", costBasisUnit: "COUNT",
    purchasePriceCents: 400, purchaseQuantity: 12, purchaseUnit: "COUNT", estimatedCentsPerBasisUnit: 400 / 12,
    volumeAmount: 1, volumeUnit: "CUP", volumeWeightGrams: 240, gramsPerCup: 240,
  });
}

async function seedPartialIngredient() {
  await test.db.insert(ingredient).values({
    id: "partial", userId: "cook", name: "Oil", normalizedName: "oil", costBasisUnit: "G",
    purchasePriceCents: 400, volumeAmount: 0.25,
  });
}

beforeEach(() => {
  test = createTestDb();
  runtime.db = test.db;
  test.sqlite.exec(`INSERT INTO user (id, name, email, createdAt, updatedAt)
    VALUES ('cook', 'Cook', 'cook@example.test', 1, 1), ('other', 'Other', 'other@example.test', 1, 1)`);
});
afterEach(() => test.sqlite.close());

describe("ingredient package pricing actions", () => {
  it("creates a name-only ingredient without fabricated purchase or conversion data", async () => {
    const result = await ingredients.create.bind(ctx)(partialForm({ name: "Tortillas" }));

    expect(result.error).toBeUndefined();
    expect(await saved(result.data!.id)).toMatchObject({
      name: "Tortillas", costBasisUnit: "G", estimatedCentsPerBasisUnit: null,
      purchasePriceCents: null, purchaseQuantity: null, purchaseUnit: null,
      volumeAmount: null, volumeUnit: null, volumeWeightGrams: null,
      gramsPerCup: null, gramsPerEach: null, preferredDisplayUnit: "AUTO",
    });
  });

  const partialMeasurementGroups: Record<string, string>[] = [
    { name: "Oil", purchasePrice: "4" },
    { name: "Flour", volumeAmount: "0.25" },
  ];

  it.each(partialMeasurementGroups)("rejects a partially supplied measurement group on create: %o", async (values) => {
    const result = await ingredients.create.bind(ctx)(partialForm(values));

    expect(result.error?.code).toBe("BAD_REQUEST");
    expect(await test.db.select().from(ingredient)).toEqual([]);
  });

  it("preserves omitted legacy and unrelated values on a name-only update", async () => {
    await seedLegacyIngredient();

    const result = await ingredients.update.bind(ctx)(partialForm({ id: "legacy", name: "Renamed" }));

    expect(result.error).toBeUndefined();
    expect(await saved("legacy")).toMatchObject({
      name: "Renamed", costBasisUnit: "LB", estimatedCentsPerBasisUnit: 0.4,
      gramsPerCup: 120, gramsPerEach: 50, preferredDisplayUnit: "LB",
      notes: "Keep airtight.", baseIngredientId: "global-base", category: "Pantry", defaultUnit: "TSP",
    });
  });

  it("preserves complete purchase and volume details on a name-only update", async () => {
    await seedCompleteIngredient();

    const result = await ingredients.update.bind(ctx)(partialForm({ id: "eggs", name: "Large eggs" }));

    expect(result.error).toBeUndefined();
    expect(await saved("eggs")).toMatchObject({
      name: "Large eggs", costBasisUnit: "COUNT", purchasePriceCents: 400,
      purchaseQuantity: 12, purchaseUnit: "COUNT", estimatedCentsPerBasisUnit: 400 / 12,
      volumeAmount: 1, volumeUnit: "CUP", volumeWeightGrams: 240, gramsPerCup: 240,
    });
  });

  it("preserves untouched legacy partial groups on an unrelated update", async () => {
    await seedPartialIngredient();

    const result = await ingredients.update.bind(ctx)(partialForm({ id: "partial", name: "Cooking oil" }));

    expect(result.error).toBeUndefined();
    expect(await saved("partial")).toMatchObject({
      name: "Cooking oil", purchasePriceCents: 400, purchaseQuantity: null, purchaseUnit: null,
      volumeAmount: 0.25, volumeUnit: null, volumeWeightGrams: null,
    });
  });

  it("allows clearing the populated value from a legacy partial group", async () => {
    await seedPartialIngredient();

    const result = await ingredients.update.bind(ctx)(partialForm({
      id: "partial", name: "Oil", purchasePrice: OPTIONAL_FIELD_CLEAR_SENTINEL,
    }));

    expect(result.error).toBeUndefined();
    expect(await saved("partial")).toMatchObject({
      purchasePriceCents: null, purchaseQuantity: null, purchaseUnit: null,
      estimatedCentsPerBasisUnit: null, volumeAmount: 0.25, volumeUnit: null, volumeWeightGrams: null,
    });
  });

  it("merges a sparse purchase update before validating the complete group", async () => {
    await seedCompleteIngredient();

    const result = await ingredients.update.bind(ctx)(partialForm({ id: "eggs", name: "Eggs", purchasePrice: "5" }));

    expect(result.error).toBeUndefined();
    expect(await saved("eggs")).toMatchObject({
      purchasePriceCents: 500, purchaseQuantity: 12, purchaseUnit: "COUNT",
      estimatedCentsPerBasisUnit: 500 / 12,
    });
  });

  it.each([
    { field: "purchaseQuantity", value: "1e-308", message: "Enter a purchase amount that gives a valid unit price." },
    { field: "purchasePrice", value: "1e308", message: "Enter a purchase amount that gives a valid unit price." },
    { field: "volumeAmount", value: "1e-308", message: "Enter a volume amount that gives a valid weight conversion." },
  ])("rejects nonfinite derived values after merging a sparse $field update", async ({ field, value, message }) => {
    await seedCompleteIngredient();
    const before = await saved("eggs");

    const result = await ingredients.update.bind(ctx)(partialForm({ id: "eggs", name: "Eggs", [field]: value }));

    expect(result.error?.code).toBe("BAD_REQUEST");
    expect(result.error?.message).toBe(message);
    expect(await saved("eggs")).toEqual(before);
  });

  it.each([
    { field: "purchaseQuantity", derivedField: "estimatedCentsPerBasisUnit", numerator: 400 },
    { field: "volumeAmount", derivedField: "gramsPerCup", numerator: 240 },
  ] as const)("accepts a small sparse $field update when its derived value stays finite", async ({ field, derivedField, numerator }) => {
    await seedCompleteIngredient();

    const result = await ingredients.update.bind(ctx)(partialForm({ id: "eggs", name: "Eggs", [field]: "1e-300" }));

    expect(result.error).toBeUndefined();
    expect((await saved("eggs"))[derivedField]).toBe(numerator / 1e-300);
  });

  it("keeps a known-zero price valid with a tiny sparse purchase quantity", async () => {
    await seedCompleteIngredient();
    await test.db.update(ingredient).set({ purchasePriceCents: 0, estimatedCentsPerBasisUnit: 0 }).where(eq(ingredient.id, "eggs"));

    const result = await ingredients.update.bind(ctx)(partialForm({ id: "eggs", name: "Eggs", purchaseQuantity: "1e-308" }));

    expect(result.error).toBeUndefined();
    expect(await saved("eggs")).toMatchObject({ purchasePriceCents: 0, purchaseQuantity: 1e-308, estimatedCentsPerBasisUnit: 0 });
  });

  it("completes a purchase group without validating an untouched legacy partial volume group", async () => {
    await seedPartialIngredient();

    const result = await ingredients.update.bind(ctx)(partialForm({
      id: "partial", name: "Oil", purchaseQuantity: "12", purchaseUnit: "COUNT",
    }));

    expect(result.error).toBeUndefined();
    expect(await saved("partial")).toMatchObject({
      purchasePriceCents: 400, purchaseQuantity: 12, purchaseUnit: "COUNT", estimatedCentsPerBasisUnit: 400 / 12,
      volumeAmount: 0.25, volumeUnit: null, volumeWeightGrams: null,
    });
  });

  it("rejects changing a legacy partial group without completing or clearing it", async () => {
    await seedPartialIngredient();
    const before = await saved("partial");

    const purchase = await ingredients.update.bind(ctx)(partialForm({
      id: "partial", name: "Oil", purchasePrice: "5",
    }));
    const volume = await ingredients.update.bind(ctx)(partialForm({
      id: "partial", name: "Oil", volumeWeightGrams: "30",
    }));

    expect(purchase.error?.code).toBe("BAD_REQUEST");
    expect(volume.error?.code).toBe("BAD_REQUEST");
    expect(purchase.error?.message).toBe("To estimate cost, enter the price, amount bought, and unit together. Leave all three blank to skip cost details.");
    expect(volume.error?.message).toBe("To convert volume to weight, enter the volume amount, unit, and weight in grams together. Leave all three blank to skip this conversion.");
    expect(await saved("partial")).toEqual(before);
  });

  it.each(["purchasePrice", "volumeAmount"])("rejects clearing only %s from a complete group", async (field) => {
    await seedCompleteIngredient();
    const before = await saved("eggs");

    const result = await ingredients.update.bind(ctx)(partialForm({
      id: "eggs", name: "Eggs", [field]: OPTIONAL_FIELD_CLEAR_SENTINEL,
    }));

    expect(result.error?.code).toBe("BAD_REQUEST");
    expect(await saved("eggs")).toEqual(before);
  });

  it("clears each measurement group only when its full group is cleared", async () => {
    await seedCompleteIngredient();

    const purchase = await ingredients.update.bind(ctx)(partialForm({
      id: "eggs", name: "Eggs",
      purchasePrice: OPTIONAL_FIELD_CLEAR_SENTINEL,
      purchaseQuantity: OPTIONAL_FIELD_CLEAR_SENTINEL,
      purchaseUnit: OPTIONAL_FIELD_CLEAR_SENTINEL,
    }));
    expect(purchase.error).toBeUndefined();
    expect(await saved("eggs")).toMatchObject({
      purchasePriceCents: null, purchaseQuantity: null, purchaseUnit: null,
      estimatedCentsPerBasisUnit: null, volumeAmount: 1, volumeUnit: "CUP", volumeWeightGrams: 240,
    });

    const volume = await ingredients.update.bind(ctx)(partialForm({
      id: "eggs", name: "Eggs",
      volumeAmount: OPTIONAL_FIELD_CLEAR_SENTINEL,
      volumeUnit: OPTIONAL_FIELD_CLEAR_SENTINEL,
      volumeWeightGrams: OPTIONAL_FIELD_CLEAR_SENTINEL,
    }));

    expect(volume.error).toBeUndefined();
    expect(await saved("eggs")).toMatchObject({
      purchasePriceCents: null, purchaseQuantity: null, purchaseUnit: null,
      estimatedCentsPerBasisUnit: null,
      volumeAmount: null, volumeUnit: null, volumeWeightGrams: null, gramsPerCup: null,
    });
  });

  it.each([
    ["1.10", "12", 110],
    ["2.20", "12", 220],
    ["1.10", "25", 110],
    ["2.20", "25", 220],
    ["7.99", "21", 799],
    ["0.07", "25", 7],
    ["0.29", "7", 29],
    ["0.001", "12", 0],
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

  it.each(["create", "update"] as const)("stores an explicit zero purchase price on %s", async (mode) => {
    if (mode === "update") {
      await test.db.insert(ingredient).values({
        id: "water", userId: "cook", name: "Water", normalizedName: "water",
        costBasisUnit: "CUP", estimatedCentsPerBasisUnit: 100,
        purchasePriceCents: 100, purchaseQuantity: 1, purchaseUnit: "CUP",
        volumeAmount: 1, volumeUnit: "CUP", volumeWeightGrams: 237, gramsPerCup: 237,
      });
    }
    const action = ingredients[mode].bind(ctx);
    const result = await action(form({
      ...(mode === "update" ? { id: "water" } : {}),
      name: "Water", purchasePrice: "0", purchaseQuantity: "1", purchaseUnit: "CUP",
      volumeAmount: "1", volumeUnit: "CUP", volumeWeightGrams: "237",
    }));

    expect(result.error).toBeUndefined();
    expect(await saved(result.data!.id)).toMatchObject({
      purchasePriceCents: 0,
      purchaseQuantity: 1,
      purchaseUnit: "CUP",
      costBasisUnit: "CUP",
      estimatedCentsPerBasisUnit: 0,
      volumeAmount: 1,
      volumeUnit: "CUP",
      volumeWeightGrams: 237,
      gramsPerCup: 237,
    });
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
      volumeAmount: "2", volumeUnit: "TBSP", volumeWeightGrams: "12", gramsPerEach: OPTIONAL_FIELD_CLEAR_SENTINEL,
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

  it("rejects invalid supplied values before changing data", async () => {
    await test.db.insert(ingredient).values({
      id: "eggs", userId: "cook", name: "Eggs", normalizedName: "eggs", costBasisUnit: "COUNT",
    });
    const before = await test.db.select().from(ingredient);

    for (const [field, value] of [["purchasePrice", "-1"], ["purchaseQuantity", "0"], ["volumeAmount", "Infinity"], ["volumeWeightGrams", "-1"]]) {
      expect((await ingredients.create.bind(ctx)(partialForm({ name: "New", [field]: value }))).error?.code).toBe("BAD_REQUEST");
      expect((await ingredients.update.bind(ctx)(partialForm({ id: "eggs", name: "Eggs", [field]: value }))).error?.code).toBe("BAD_REQUEST");
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
