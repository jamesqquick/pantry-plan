import { beforeEach, describe, expect, it, vi } from "vitest";
import { recipe, recipeTag, tag, user, type Db } from "@/db";
import { createTestDb } from "@/test/d1";
import type { RecipeSearchInstance } from "./recipe-index";
import { searchUserRecipes, semanticRecipeIds } from "./recipe-search";

type Chunk = AiSearchSearchResponse["chunks"][number];

function chunk(userId: string, recipeId: string, score: number): Chunk {
  return {
    id: `${recipeId}-${score}`,
    type: "text",
    score,
    text: "ignored",
    item: {
      key: `users/${userId}/recipes/${recipeId}.md`,
      metadata: { user_id: userId, recipe_id: recipeId },
    },
  };
}

function fakeInstance(chunks: Chunk[] | Error) {
  const search = vi.fn(async () => {
    if (chunks instanceof Error) throw chunks;
    return { search_query: "q", chunks };
  });
  const upload = vi.fn(async (key: string) => ({ id: `item-${key}`, key }));
  const instance = {
    search,
    items: { upload, delete: vi.fn() },
  } as unknown as RecipeSearchInstance;
  return { instance, search, upload };
}

let db: Db;

beforeEach(async () => {
  db = createTestDb().db;
  await db.insert(user).values([
    { id: "u1", name: "u1", email: "u1@example.com" },
    { id: "u2", name: "u2", email: "u2@example.com" },
  ]);
  await db.insert(recipe).values([
    { id: "pasta", userId: "u1", title: "Tomato Pasta", updatedAt: new Date(3000) },
    { id: "tacos", userId: "u1", title: "Tropical Omelet And Tacos", updatedAt: new Date(2000) },
    { id: "stew", userId: "u1", title: "Beef Stew", updatedAt: new Date(1000) },
    { id: "theirs", userId: "u2", title: "Tomato Soup" },
  ]);
});

describe("searchUserRecipes", () => {
  it("uses title matching when semantic search is disabled", async () => {
    const { instance, search } = fakeInstance([]);

    const result = await searchUserRecipes(
      { db, instance, semanticEnabled: false },
      "u1",
      { query: "tomato", limit: 10 },
    );

    expect(result).toEqual({ ids: ["pasta", "tacos"], mode: "title" });
    expect(search).not.toHaveBeenCalled();
  });

  it("ranks exact titles, then verified semantic hits, then loose title matches", async () => {
    const { instance, search } = fakeInstance([
      chunk("u1", "stew", 0.6),
      chunk("u1", "pasta", 0.9),
      chunk("u1", "deleted-recipe", 0.95),
      chunk("u2", "theirs", 0.99),
      chunk("u1", "stew", 0.5),
    ]);

    const result = await searchUserRecipes(
      { db, instance, semanticEnabled: true },
      "u1",
      { query: "tomato", limit: 10 },
    );

    expect(result).toEqual({ ids: ["pasta", "stew", "tacos"], mode: "semantic" });
    expect(search).toHaveBeenCalledWith({
      query: "tomato",
      ai_search_options: {
        retrieval: {
          filters: { user_id: "u1" },
          max_num_results: 50,
          keyword_match_mode: "or",
          return_on_failure: false,
        },
        cache: { enabled: false },
      },
    });
  });

  it("falls back to title matches when AI Search fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { instance } = fakeInstance(new Error("upstream 503"));

    const result = await searchUserRecipes(
      { db, instance, semanticEnabled: true },
      "u1",
      { query: "tomato", limit: 1 },
    );

    expect(result).toEqual({ ids: ["pasta"], mode: "degraded" });
    error.mockRestore();
  });

  it("restricts both title and semantic results to the tag", async () => {
    await db.insert(tag).values({ id: "t1", userId: "u1", name: "dinner" });
    await db.insert(recipeTag).values({ recipeId: "stew", tagId: "t1" });
    const { instance } = fakeInstance([chunk("u1", "pasta", 0.9), chunk("u1", "stew", 0.8)]);

    const result = await searchUserRecipes(
      { db, instance, semanticEnabled: true },
      "u1",
      { query: "hearty", tagId: "t1", limit: 10 },
    );

    expect(result.ids).toEqual(["stew"]);
  });

  it("returns no results without an instance when nothing matches the title", async () => {
    const result = await searchUserRecipes(
      { db, instance: null, semanticEnabled: true },
      "u1",
      { query: "curry", limit: 10 },
    );
    expect(result).toEqual({ ids: [], mode: "title" });
  });

  it("schedules a lazy backfill of unindexed recipes", async () => {
    const { instance, upload } = fakeInstance([]);
    const pending: Promise<unknown>[] = [];

    await searchUserRecipes(
      { db, instance, semanticEnabled: false, waitUntil: (p) => pending.push(p) },
      "u1",
      { query: "tomato", limit: 10 },
    );
    await Promise.all(pending);

    expect(upload).toHaveBeenCalledTimes(3);
  });
});

describe("semanticRecipeIds", () => {
  it("falls back to parsing the key and ignores foreign keys", async () => {
    const { instance } = fakeInstance([
      { ...chunk("u1", "pasta", 0.9), item: { key: "users/u1/recipes/pasta.md" } },
      { ...chunk("u2", "theirs", 0.8), item: { key: "users/u2/recipes/theirs.md" } },
    ]);

    await expect(semanticRecipeIds(instance, "u1", "q")).resolves.toEqual(["pasta"]);
  });
});
