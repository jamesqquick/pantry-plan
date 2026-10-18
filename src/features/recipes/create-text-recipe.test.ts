import { afterEach, describe, expect, it } from "vitest";
import type { DatabaseSync } from "node:sqlite";
import { recipeIngredient } from "@/db";
import { createTestDb } from "@/test/d1";
import { createTextOnlyRecipe } from "./create-text-recipe";

let sqlite: DatabaseSync;
afterEach(() => sqlite?.close());

describe("quick recipe saves", () => {
  it("stores safe quantities independently of mapping and preserves difficult lines", async () => {
    const test = createTestDb();
    sqlite = test.sqlite;
    sqlite.exec(`INSERT INTO user (id, name, email, createdAt, updatedAt)
      VALUES ('cook', 'Cook', 'cook@example.test', 1, 1)`);
    const lines = ["1½ cups flour", "3 eggs", "Salt to taste", "2-3 cloves garlic", "1 cup flour (120 g)"];
    lines.push(
      "1 cup plus a tablespoon sugar", "1 cup or two cups milk", "1 ⅙ tsp salt",
      "1 cup flour (⅕ kg)", "400g tin chopped tomatoes", "12 oz bag chocolate chips",
      "0.75 l milk", "500 ml milk", "1 fl oz vanilla", `${"1" + "0".repeat(303)} g flour`,
      "1 cup + a tablespoon sugar", "1 cup minus a tablespoon flour", "1 tbsp butter (half an ounce)",
      "1 cup sugar, plus another tablespoon", "1 cup sugar, and another tablespoon",
      "1 cup sugar, plus extra tablespoon", "1 cup sugar with an extra tablespoon",
      "2 heaping tbsp sugar", "2 rounded tsp sugar", "400g small tin chopped tomatoes",
      "12 oz resealable bag chocolate chips", "400 g (one tin) chopped tomatoes", "1 to 2% salt",
    );

    await createTextOnlyRecipe(test.db, "cook", {
      recipe: { title: "Pancakes", instructions: ["Mix and cook."], tagIds: [] },
      ingredients: lines,
    });

    const rows = await test.db.select().from(recipeIngredient);
    expect(rows.map(({ ingredientId }) => ingredientId)).toEqual(lines.map(() => null));
    expect(rows.map(({ quantity, unit, displayText, rawText }) => ({ quantity, unit, displayText, rawText })))
      .toEqual([
        { quantity: 1.5, unit: "CUP", displayText: "flour", rawText: lines[0] },
        { quantity: 3, unit: "COUNT", displayText: "eggs", rawText: lines[1] },
        ...lines.slice(2).map((line) => ({ quantity: null, unit: null, displayText: line, rawText: line })),
      ]);
  });
});
