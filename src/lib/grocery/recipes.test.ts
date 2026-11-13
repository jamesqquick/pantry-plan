import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb, ingredient, recipe, recipeIngredient } from "@/db";
import { createTestDb } from "@/test/d1";
import { loadOwnedRecipeAvailability } from "./recipes";

let test: ReturnType<typeof createTestDb>;

class D1BindingLimitError extends Error {
  constructor(public readonly count: number) {
    super(`D1 query uses ${count} bound parameters; maximum is 100.`);
    this.name = "D1BindingLimitError";
  }
}

beforeEach(() => {
  test = createTestDb();
  test.sqlite.exec(`INSERT INTO user (id, name, email, createdAt, updatedAt)
    VALUES ('cook', 'Cook', 'cook@example.test', 1, 1), ('other', 'Other', 'other@example.test', 1, 1)`);
});

afterEach(() => test.sqlite.close());

describe("loadOwnedRecipeAvailability", () => {
  it("summarizes owned recipe issues using visible ingredients only", async () => {
    await test.db.insert(ingredient).values([
      {
        id: "salt",
        name: "Salt",
        normalizedName: "salt",
        costBasisUnit: "G",
        estimatedCentsPerBasisUnit: 1,
      },
      {
        id: "flour",
        userId: "cook",
        name: "Flour",
        normalizedName: "flour",
        costBasisUnit: "G",
      },
      {
        id: "private-secret-id",
        userId: "other",
        name: "Secret Flour",
        normalizedName: "secret-flour",
        costBasisUnit: "G",
      },
    ]);
    await test.db.insert(recipe).values([
      { id: "soup", userId: "cook", title: "Soup" },
      { id: "clean", userId: "cook", title: "Clean recipe" },
      { id: "foreign", userId: "other", title: "Private recipe" },
    ]);
    await test.db.insert(recipeIngredient).values([
      { id: "soup-flour", recipeId: "soup", ingredientId: "flour", quantity: 1, unit: "CUP", displayText: "1 cup flour", sortOrder: 0 },
      { id: "soup-unmapped", recipeId: "soup", ingredientId: null, quantity: 1, unit: "TSP", displayText: "mystery spice", sortOrder: 1 },
      { id: "soup-private", recipeId: "soup", ingredientId: "private-secret-id", quantity: 1, unit: "CUP", displayText: "Secret Flour", sortOrder: 2 },
      { id: "clean-salt", recipeId: "clean", ingredientId: "salt", quantity: 10, unit: "G", displayText: "salt", sortOrder: 0 },
      { id: "foreign-salt", recipeId: "foreign", ingredientId: "salt", quantity: 10, unit: "G", displayText: "salt", sortOrder: 0 },
    ]);

    const availability = await loadOwnedRecipeAvailability(test.db, "cook", ["soup", "clean", "foreign"]);

    expect(Object.keys(availability).sort()).toEqual(["clean", "soup"]);
    expect(availability.clean).toEqual({
      status: "checked", notices: [],
      quantityGroups: [{ ingredientId: "salt", basisUnit: "G", gramsPerCup: null, gramsPerEach: null, cupsPerEach: null }],
    });
    expect(availability.soup).toMatchObject({
      status: "checked",
      notices: expect.arrayContaining([
        { code: "missing-price", message: expect.stringContaining("Flour"), href: "/ingredients/flour" },
        { code: "unmapped", message: expect.stringContaining("mystery spice"), href: "/recipes/soup/edit#recipe-ingredients" },
        { code: "unmapped", message: expect.not.stringContaining("Secret Flour"), href: "/recipes/soup/edit#recipe-ingredients" },
      ]),
    });
    expect(JSON.stringify(availability)).not.toContain("private-secret-id");
    expect(JSON.stringify(availability)).not.toContain("Secret Flour");
  });

  it.each([null, 1])("keeps per-recipe notices independent of unselected recipe options when the rate is %s", async (rate) => {
    await test.db.insert(ingredient).values({
      id: "onion", name: "Onion", normalizedName: "onion", costBasisUnit: "G", estimatedCentsPerBasisUnit: rate,
    });
    await test.db.insert(recipe).values([
      { id: "counted", userId: "cook", title: "Counted onions" },
      { id: "weighed", userId: "cook", title: "Weighed onions" },
      { id: "mixed", userId: "cook", title: "Mixed onions" },
    ]);
    await test.db.insert(recipeIngredient).values([
      { id: "counted-line", recipeId: "counted", ingredientId: "onion", quantity: 2, unit: "COUNT", displayText: "2 onions", sortOrder: 0 },
      { id: "weighed-line", recipeId: "weighed", ingredientId: "onion", quantity: 200, unit: "G", displayText: "200 g onions", sortOrder: 0 },
      { id: "mixed-count", recipeId: "mixed", ingredientId: "onion", quantity: 2, unit: "COUNT", displayText: "2 onions", sortOrder: 0 },
      { id: "mixed-weight", recipeId: "mixed", ingredientId: "onion", quantity: 200, unit: "G", displayText: "200 g onions", sortOrder: 1 },
    ]);
    const counted = await loadOwnedRecipeAvailability(test.db, "cook", ["counted"]);
    const weighed = await loadOwnedRecipeAvailability(test.db, "cook", ["weighed"]);

    for (const ids of [["counted", "weighed", "mixed"], ["mixed", "weighed", "counted", "weighed"]]) {
      const availability = await loadOwnedRecipeAvailability(test.db, "cook", ids);

      expect(availability.counted).toEqual(counted.counted);
      expect(availability.weighed).toEqual(weighed.weighed);
      expect(availability.mixed?.notices.filter(({ code }) => code === "cannot-combine")).toEqual([
        { code: "cannot-combine", message: "Add weight per item to combine count and mass quantities; kept separate.", href: "/ingredients/onion" },
      ]);
    }
  });

  it.each([99, 205])("checks %s owned recipes within D1's bound-parameter limit", async (count) => {
    const ids = Array.from({ length: count }, (_, index) => `recipe-${index}`);
    await test.db.insert(ingredient).values({ id: "salt", name: "Salt", normalizedName: "salt", costBasisUnit: "G", estimatedCentsPerBasisUnit: 1 });
    const insertRecipe = test.sqlite.prepare("INSERT INTO Recipe (id, userId, title) VALUES (?, ?, ?)");
    const insertLine = test.sqlite.prepare("INSERT INTO RecipeIngredient (id, recipeId, ingredientId, quantity, unit, displayText, sortOrder) VALUES (?, ?, 'salt', 1, 'G', '1 g salt', 0)");
    for (const id of ids) {
      insertRecipe.run(id, "cook", id);
      insertLine.run(`${id}-salt`, id);
    }
    insertRecipe.run("foreign", "other", "Private recipe");
    await test.db.insert(recipeIngredient).values({
      id: "unmapped", recipeId: ids.at(-1)!, ingredientId: null, quantity: 1, unit: "TSP", displayText: "Missing spice", sortOrder: 1,
    });
    const parameterCounts: number[] = [];
    const binding = {
      prepare(query: string) {
        const statement = test.binding.prepare(query);
        return new Proxy(statement, {
          get(target, property) {
            if (property === "bind") return (...params: unknown[]) => {
              parameterCounts.push(params.length);
              if (params.length > 100) throw new D1BindingLimitError(params.length);
              return target.bind(...params);
            };
            const value = Reflect.get(target, property);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
      },
    } as unknown as D1Database;

    const requestedIds = count === 99 ? [...ids, ids[0]!] : [...ids, "foreign", "missing", ids[0]!];
    const availability = await loadOwnedRecipeAvailability(createDb(binding), "cook", requestedIds);

    expect(parameterCounts.length).toBeGreaterThan(1);
    expect(Math.max(...parameterCounts)).toBeLessThanOrEqual(100);
    expect(Object.keys(availability).sort()).toEqual([...ids].sort());
    expect(Object.values(availability).every(({ status }) => status === "checked")).toBe(true);
    expect(Object.values(availability).filter(({ notices }) => notices.length > 0)).toHaveLength(1);
    expect(availability[ids.at(-1)!]?.notices).toEqual([
      { code: "unmapped", message: "Map “Missing spice” to an ingredient.", href: `/recipes/${ids.at(-1)}/edit#recipe-ingredients` },
    ]);
    expect(Object.values(availability).every(({ quantityGroups }) => quantityGroups?.length === 1)).toBe(true);
  });

  it("marks only owned recipes unavailable if their ingredient query fails", async () => {
    await test.db.insert(recipe).values([
      { id: "soup", userId: "cook", title: "Soup" },
      { id: "foreign", userId: "other", title: "Private recipe" },
    ]);
    const binding = {
      prepare(query: string) {
        if (query.includes('"RecipeIngredient"')) throw new TypeError("Ingredient read unavailable");
        return test.binding.prepare(query);
      },
    } as unknown as D1Database;

    const availability = await loadOwnedRecipeAvailability(createDb(binding), "cook", ["soup", "foreign"]);

    expect(availability).toEqual({ soup: { status: "unavailable", notices: [] } });
  });

  it("reports a failed check as unavailable instead of returning a clean recipe", async () => {
    const unavailableDb = {
      select() {
        throw new Error("Database unavailable");
      },
    } as unknown as typeof test.db;

    const availability = await loadOwnedRecipeAvailability(unavailableDb, "cook", ["soup", "other"]);

    expect(availability).toEqual({
      soup: { status: "unavailable", notices: [] },
      other: { status: "unavailable", notices: [] },
    });
  });
});
