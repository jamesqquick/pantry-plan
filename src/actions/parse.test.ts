import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionAPIContext } from "astro:actions";
import { ingredient, recipe, type Db } from "@/db";
import { createTestDb } from "@/test/d1";

const runtime = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  env: { AI: {} as Ai, AI_RATE_LIMIT: {} },
  parseRecipeFromUrl: vi.fn(),
  extractRecipeFromImage: vi.fn(),
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
}));
vi.mock("@/lib/parse/parse-recipe", () => ({ parseRecipeFromUrl: runtime.parseRecipeFromUrl }));
vi.mock("@/lib/ai/extract-recipe-from-image", () => ({ extractRecipeFromImage: runtime.extractRecipeFromImage }));
vi.mock("@/lib/ingredients/suggest-ingredient-mappings", () => ({ suggestIngredientMappings: runtime.suggestIngredientMappings }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(async () => undefined) }));
vi.mock("@/lib/feature-flags", () => ({ getBooleanFlag: vi.fn(async () => true) }));

import { parse } from "./parse";

let test: ReturnType<typeof createTestDb>;
const ctx = {
  [Symbol.for("astro.actionAPIContext")]: true,
  locals: { user: { id: "cook", email: "cook@example.test" } },
} as unknown as ActionAPIContext;

beforeEach(() => {
  test = createTestDb();
  runtime.db = test.db;
  runtime.parseRecipeFromUrl.mockReset().mockResolvedValue({
    ok: true,
    data: {
      title: "Pasta",
      sourceUrl: "https://example.com/pasta",
      ingredients: ["2 cups flour", "", "3 eggs"],
      instructions: ["Mix."],
    },
  });
  runtime.extractRecipeFromImage.mockReset().mockResolvedValue({
    title: "Pasta",
    ingredients: ["2 cups flour", "3 eggs"],
    instructions: ["Mix."],
  });
  runtime.suggestIngredientMappings.mockReset().mockResolvedValue({ suggestions: [], aiStatus: "not-needed" });
});

afterEach(() => {
  test.sqlite.close();
});

describe("parse actions", () => {
  it("matches a catalog ingredient during URL import using the real matcher", async () => {
    await test.db.insert(ingredient).values({
      id: "flour",
      name: "Flour",
      normalizedName: "flour",
      costBasisUnit: "G",
    });
    const { suggestIngredientMappings } = await vi.importActual<typeof import("@/lib/ingredients/suggest-ingredient-mappings")>(
      "@/lib/ingredients/suggest-ingredient-mappings",
    );
    runtime.suggestIngredientMappings.mockImplementationOnce((db, lines, userId) =>
      suggestIngredientMappings(db, lines, userId, undefined),
    );

    const result = await parse.parseFromUrl.bind(ctx)({ url: "https://example.com/pasta" });

    expect(result.error).toBeUndefined();
    expect(result.data?.ingredientLines[0]).toMatchObject({
      raw: "2 cups flour",
      ingredientId: "flour",
      ingredientName: "Flour",
    });
    expect(await test.db.select().from(recipe)).toEqual([]);
  });

  it("returns catalog matches with URL ingredients before the draft is shown without writing", async () => {
    runtime.suggestIngredientMappings.mockResolvedValueOnce({
      suggestions: [
        { suggestedIngredient: { id: "flour", name: "Flour" } },
        {},
        { suggestedCreateName: "Egg" },
      ],
      aiStatus: "succeeded",
    });

    const result = await parse.parseFromUrl.bind(ctx)({ url: "https://example.com/pasta" });

    expect(result.error).toBeUndefined();
    expect(result.data?.ingredientLines).toMatchObject([
      { raw: "2 cups flour", ingredientId: "flour", ingredientName: "Flour" },
      { raw: "" },
      { raw: "3 eggs", createName: "Egg" },
    ]);
    expect(runtime.suggestIngredientMappings).toHaveBeenCalledWith(test.db, ["2 cups flour", "", "3 eggs"], "cook", runtime.env.AI);
    expect(await test.db.select().from(ingredient)).toEqual([]);
    expect(await test.db.select().from(recipe)).toEqual([]);
  });

  it("returns the URL draft without catalog matches when matching fails", async () => {
    runtime.suggestIngredientMappings.mockRejectedValueOnce(new Error("Catalog unavailable"));

    const result = await parse.parseFromUrl.bind(ctx)({ url: "https://example.com/pasta" });

    expect(result.error).toBeUndefined();
    expect(result.data?.ingredients).toEqual(["2 cups flour", "", "3 eggs"]);
    expect(result.data?.ingredientLines[0]).toMatchObject({ raw: "2 cups flour" });
    expect(result.data?.ingredientLines[0]?.ingredientId).toBeUndefined();
  });

  it("includes catalog matches in the photo parse response", async () => {
    runtime.suggestIngredientMappings.mockResolvedValueOnce({
      suggestions: [
        { suggestedIngredient: { id: "flour", name: "Flour" } },
        { suggestedCreateName: "Egg" },
      ],
      aiStatus: "succeeded",
    });
    const formData = new FormData();
    formData.append("image", new File(["image"], "recipe.png", { type: "image/png" }));

    const result = await parse.parseFromImage.bind(ctx)(formData);

    expect(result.error).toBeUndefined();
    expect(result.data?.ingredientLines).toMatchObject([
      { raw: "2 cups flour", ingredientId: "flour", ingredientName: "Flour" },
      { raw: "3 eggs", createName: "Egg" },
    ]);
    expect(runtime.suggestIngredientMappings).toHaveBeenCalledWith(test.db, ["2 cups flour", "3 eggs"], "cook", runtime.env.AI);
  });

  it("keeps the photo import usable when matching fails", async () => {
    runtime.suggestIngredientMappings.mockRejectedValueOnce(new Error("Catalog unavailable"));
    const formData = new FormData();
    formData.append("image", new File(["image"], "recipe.png", { type: "image/png" }));

    const result = await parse.parseFromImage.bind(ctx)(formData);

    expect(result.error).toBeUndefined();
    expect(result.data?.ingredientLines).toMatchObject([{ raw: "2 cups flour" }, { raw: "3 eggs" }]);
    expect(result.data?.ingredientLines[0]?.ingredientId).toBeUndefined();
  });
});
