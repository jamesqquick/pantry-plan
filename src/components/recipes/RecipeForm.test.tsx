// @vitest-environment jsdom

import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DatabaseSync } from "node:sqlite";
import { recipeIngredient } from "@/db";
import { createTestDb } from "@/test/d1";
import { createTextOnlyRecipe } from "@/features/recipes/create-text-recipe";
import { formatQuantityForInput } from "@/lib/quantity/quantity";
import RecipeForm from "./RecipeForm";

const { update } = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("astro:actions", () => ({ actions: { recipes: { update } } }));
vi.mock("./IngredientMapper", () => ({ IngredientMapper: () => null }));

let sqlite: DatabaseSync;
afterEach(() => {
  cleanup();
  sqlite?.close();
  vi.resetAllMocks();
});

it("preserves imported small quantities when submitting an unrelated title edit", async () => {
  const test = createTestDb();
  sqlite = test.sqlite;
  sqlite.exec(`INSERT INTO user (id, name, email, createdAt, updatedAt)
    VALUES ('cook', 'Cook', 'cook@example.test', 1, 1)`);
  const { recipeId } = await createTextOnlyRecipe(test.db, "cook", {
    recipe: { title: "Small batch", instructions: ["Mix and cook."], tagIds: [] },
    ingredients: ["1/64 tsp salt", "1/32 tsp pepper", "0.01 g saffron", "1.2345 g flour"],
  });
  const rows = await test.db.select().from(recipeIngredient);
  update.mockResolvedValue({ data: undefined, error: undefined });
  const user = userEvent.setup();
  render(<RecipeForm mode="edit" allTags={[]} initial={{
    id: recipeId,
    title: "Small batch",
    sourceUrl: "", imageUrl: "", servings: "", prepTimeMinutes: "",
    cookTimeMinutes: "", totalTimeMinutes: "", notes: "", tagIds: [],
    instructions: ["Mix and cook."],
    ingredients: rows.map((row) => ({
      displayText: row.displayText,
      quantityText: formatQuantityForInput(row.quantity),
      unit: row.unit ?? "",
      rawText: row.rawText,
      ingredientId: row.ingredientId,
    })),
  }} />);
  await user.clear(screen.getByLabelText("Title"));
  await user.type(screen.getByLabelText("Title"), "Small batch, edited");
  await user.click(screen.getByRole("button", { name: "Save changes" }));

  expect(update).toHaveBeenCalledOnce();
  expect(update.mock.calls[0][0]).toMatchObject({
    title: "Small batch, edited",
    ingredientsStructured: rows.map((row, sortOrder) => ({
      quantity: row.quantity, unit: row.unit, displayText: row.displayText,
      rawText: row.rawText, ingredientId: "", sortOrder,
    })),
  });
  expect(rows.map((row) => row.quantity)).toEqual([1 / 64, 1 / 32, 0.01, 1.2345]);
});
