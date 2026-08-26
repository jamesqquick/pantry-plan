import { describe, expect, it } from "vitest";
import type { Db } from "@/db";
import { fuzzyFilterRecipes } from "@/lib/search/fuzzy-recipe";
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

function mockDb(titleRows: unknown[], summaryRows: unknown[] = []) {
  let selectCount = 0;
  const db = {
    select() {
      selectCount += 1;
      const rows = selectCount === 1 ? titleRows : summaryRows;
      const chain = {
        from: () => chain,
        where: () => ({
          orderBy: async () => rows,
          then: (resolve: (value: unknown[]) => unknown) => resolve(rows),
        }),
        orderBy: async () => rows,
      };
      return chain;
    },
    get selectCount() {
      return selectCount;
    },
  };
  return db;
}

describe("searchRecipes", () => {
  it("fetches summaries only for the ranked, limited matches", async () => {
    const db = mockDb(
      [
        { id: "fuzzy", title: "Tropical Omelet And Tacos" },
        { id: "exact", title: "Tomato Pasta" },
      ],
      [{ id: "exact", title: "Tomato Pasta", imageUrl: null, sourceUrl: null, servings: 2, prepTimeMinutes: 10, cookTimeMinutes: null, totalTimeMinutes: 20 }],
    );

    const results = await searchRecipes(db as unknown as Db, "user-1", "tomato", 1);

    expect(results).toEqual([
      { id: "exact", title: "Tomato Pasta", imageUrl: null, sourceUrl: null, servings: 2, prepTimeMinutes: 10, cookTimeMinutes: null, totalTimeMinutes: 20 },
    ]);
    expect(db.selectCount).toBe(2);
  });

  it("does not fetch summaries when there are no title matches", async () => {
    const db = mockDb([{ id: "one", title: "Pasta" }]);

    await expect(searchRecipes(db as unknown as Db, "user-1", "soup", 10)).resolves.toEqual([]);
    expect(db.selectCount).toBe(1);
  });
});
