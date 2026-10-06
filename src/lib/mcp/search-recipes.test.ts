import { beforeEach, describe, expect, it } from "vitest";
import { recipe, recipeTag, tag, user, type Db } from "@/db";
import { fuzzyFilterRecipes } from "@/lib/search/fuzzy-recipe";
import { createTestDb } from "@/test/d1";
import { TagNotFoundError } from "./recipe-errors";
import { searchRecipes } from "./search-recipes";

describe("recipe search ranking", () => {
  it("ranks title substring matches before fuzzy matches and applies the limit", () => {
    const results = fuzzyFilterRecipes(
      [
        { id: "fuzzy", title: "Tropical Omelet And Tacos" },
        { id: "exact", title: "Tomato Pasta" },
        { id: "other", title: "Roasted Vegetables" },
      ],
      "tomato",
    );

    expect(results.slice(0, 1)).toEqual([{ id: "exact", title: "Tomato Pasta" }]);
    expect(results.map((result) => result.id)).toEqual(["exact", "fuzzy"]);
  });
});

describe("searchRecipes", () => {
  let db: Db;
  const deps = () => ({ db, instance: null, semanticEnabled: false });

  beforeEach(async () => {
    db = createTestDb().db;
    await db.insert(user).values([
      { id: "u1", name: "u1", email: "u1@example.com" },
      { id: "u2", name: "u2", email: "u2@example.com" },
    ]);
    await db.insert(recipe).values([
      { id: "exact", userId: "u1", title: "Tomato Pasta", servings: 2, prepTimeMinutes: 10, totalTimeMinutes: 20 },
      { id: "fuzzy", userId: "u1", title: "Tropical Omelet And Tacos" },
      { id: "theirs", userId: "u2", title: "Tomato Soup" },
    ]);
  });

  it("returns ranked, limited summaries for the user's recipes only", async () => {
    const result = await searchRecipes(deps(), "u1", { query: "tomato", limit: 1 });

    expect(result).toEqual({
      mode: "title",
      recipes: [
        { id: "exact", title: "Tomato Pasta", imageUrl: null, sourceUrl: null, servings: 2, prepTimeMinutes: 10, cookTimeMinutes: null, totalTimeMinutes: 20 },
      ],
    });
  });

  it("returns nothing when no recipe matches", async () => {
    await expect(searchRecipes(deps(), "u1", { query: "soup", limit: 10 })).resolves.toEqual({
      recipes: [],
      mode: "title",
    });
  });

  it("filters by tag name case-insensitively", async () => {
    await db.insert(tag).values({ id: "t1", userId: "u1", name: "Dinner" });
    await db.insert(recipeTag).values({ recipeId: "fuzzy", tagId: "t1" });

    const result = await searchRecipes(deps(), "u1", { query: "tomato", limit: 10, tag: "dinner" });

    expect(result.recipes.map((r) => r.id)).toEqual(["fuzzy"]);
  });

  it("rejects tags the user does not have", async () => {
    await db.insert(tag).values({ id: "t2", userId: "u2", name: "dinner" });

    await expect(
      searchRecipes(deps(), "u1", { query: "tomato", limit: 10, tag: "dinner" }),
    ).rejects.toBeInstanceOf(TagNotFoundError);
  });
});
