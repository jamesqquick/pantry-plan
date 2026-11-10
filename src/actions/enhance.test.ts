import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionAPIContext } from "astro:actions";
import { ingredient, recipe, recipeIngredient, type Db } from "@/db";
import { createTestDb } from "@/test/d1";

const runtime = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  env: { DB: undefined as D1Database | undefined, AI: undefined as Ai | undefined },
  queueSearchSync: vi.fn(async () => undefined),
  suggestIngredientMappings: vi.fn(),
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
vi.mock("@/lib/ingredients/suggest-ingredient-mappings", () => ({
  suggestIngredientMappings: runtime.suggestIngredientMappings,
}));

import { enhance } from "./enhance";

let test: ReturnType<typeof createTestDb>;
const ctx = {
  [Symbol.for("astro.actionAPIContext")]: true,
  locals: { user: { id: "cook" } },
} as unknown as ActionAPIContext;

beforeEach(() => {
  test = createTestDb();
  runtime.db = test.db;
  runtime.env.DB = test.binding;
  runtime.suggestIngredientMappings.mockReset().mockResolvedValue({
    suggestions: [{
      originalLine: "1 tsp mystery spice",
      normalizedKey: "mystery spice",
      suggestedCreateName: "Mystery spice",
    }],
    aiStatus: "not-needed",
  });
  runtime.queueSearchSync.mockClear();
  test.sqlite.exec("INSERT INTO user (id, name, email, createdAt, updatedAt) VALUES ('cook', 'Cook', 'cook@example.test', 1, 1)");
});

afterEach(() => {
  vi.restoreAllMocks();
  test.sqlite.close();
});

describe("enhance.recipeIngredients", () => {
  it("creates a name-only ingredient without changing valid recipe measurements", async () => {
    await test.db.insert(recipe).values({ id: "soup", userId: "cook", title: "Soup" });
    await test.db.insert(recipeIngredient).values({
      recipeId: "soup",
      quantity: 1,
      unit: "TSP",
      displayText: "mystery spice",
      rawText: "1 tsp mystery spice",
      sortOrder: 0,
    });

    const result = await enhance.recipeIngredients.bind(ctx)({ recipeId: "soup" });

    expect(result.error).toBeUndefined();
    const [created] = await test.db.select().from(ingredient);
    expect(created).toMatchObject({
      userId: "cook",
      name: "Mystery spice",
      normalizedName: "mystery spice",
      purchasePriceCents: null,
      purchaseQuantity: null,
      purchaseUnit: null,
      volumeAmount: null,
      volumeUnit: null,
      volumeWeightGrams: null,
      gramsPerCup: null,
      gramsPerEach: null,
    });
    expect(await test.db.select().from(recipeIngredient)).toMatchObject([{
      ingredientId: created!.id,
      quantity: 1,
      unit: "TSP",
      displayText: "mystery spice",
      rawText: "1 tsp mystery spice",
    }]);
    expect(runtime.suggestIngredientMappings).toHaveBeenCalledWith(test.db, ["1 tsp mystery spice"], "cook", undefined);
    expect(runtime.queueSearchSync).toHaveBeenCalledWith(ctx, test.db, ["soup"]);
  });
});
