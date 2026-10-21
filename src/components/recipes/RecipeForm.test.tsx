// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DatabaseSync } from "node:sqlite";

import { recipeIngredient } from "@/db";
import { createTestDb } from "@/test/d1";
import { createTextOnlyRecipe } from "@/features/recipes/create-text-recipe";
import { formatQuantityForInput } from "@/lib/quantity/quantity";
import RecipeForm, { type RecipeFormInitial } from "./RecipeForm";

const { create, update, searchForPicker } = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  searchForPicker: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    recipes: { create, update },
    ingredients: { searchForPicker },
  },
}));

const initial: RecipeFormInitial = {
  id: "recipe-123",
  title: "Pasta",
  sourceUrl: "https://example.com/pasta",
  imageUrl: "",
  servings: "4",
  prepTimeMinutes: "10",
  cookTimeMinutes: "20",
  totalTimeMinutes: "30",
  notes: "Serve warm.",
  tagIds: ["dinner"],
  instructions: [" Mix the dough. ", "", "Cook until tender."],
  ingredients: [
    {
      displayText: " Flour ",
      quantityText: "1 1/2",
      unit: "CUP",
      rawText: "1 1/2 cups flour, sifted",
      ingredientId: "flour-id",
      ingredientName: "Flour",
    },
    {
      displayText: "",
      quantityText: "",
      unit: "",
      rawText: null,
      ingredientId: null,
    },
    {
      displayText: "Eggs",
      quantityText: "3",
      unit: "COUNT",
      rawText: "3 large eggs",
      ingredientId: "eggs-id",
      ingredientName: "Eggs",
    },
  ],
};

let sqlite: DatabaseSync | undefined;

beforeEach(() => {
  create.mockResolvedValue({ data: undefined, error: { message: "Could not save recipe" } });
  update.mockResolvedValue({ data: undefined, error: { message: "Could not save recipe" } });
  searchForPicker.mockResolvedValue({
    data: [{ id: "duck-eggs-id", name: "Duck eggs", source: "global" }],
    error: undefined,
  });
});

afterEach(() => {
  cleanup();
  sqlite?.close();
  sqlite = undefined;
  vi.resetAllMocks();
});

describe("RecipeForm ordering", () => {
  it.each(["create", "edit"] as const)("serializes the new order in %s mode without losing ingredient details", async (mode) => {
    const user = userEvent.setup();
    render(<RecipeForm mode={mode} initial={initial} allTags={[]} />);
    const eggs = screen.getByRole("textbox", { name: "Ingredient 3 name" });

    await user.click(screen.getByRole("button", { name: "Move ingredient 3 up" }));
    await user.click(screen.getByRole("button", { name: "Move ingredient 2 up" }));
    expect(screen.getByRole("textbox", { name: "Ingredient 1 name" })).toBe(eggs);
    expect(screen.getByRole("textbox", { name: "Step 1" })).toHaveProperty("value", " Mix the dough. ");

    await user.click(screen.getByRole("button", { name: "Move step 3 up" }));
    await user.click(screen.getByRole("button", { name: "Move step 2 up" }));
    await user.click(screen.getByRole("button", { name: mode === "create" ? "Create recipe" : "Save changes" }));

    const save = mode === "create" ? create : update;
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save.mock.calls[0][0]).toEqual(expect.objectContaining({
      ...(mode === "edit" ? { id: "recipe-123" } : {}),
      title: "Pasta",
      servings: 4,
      tagIds: ["dinner"],
      instructions: ["Cook until tender.", "Mix the dough."],
      ingredientsStructured: [
        { sortOrder: 0, displayText: "Eggs", rawText: "3 large eggs", quantity: 3, unit: "COUNT", ingredientId: "eggs-id" },
        { sortOrder: 1, displayText: "Flour", rawText: "1 1/2 cups flour, sifted", quantity: 1.5, unit: "CUP", ingredientId: "flour-id" },
      ],
    }));
    expect(screen.getByRole("textbox", { name: "Ingredient 1 name" })).toBe(eggs);
    expect(screen.getByRole("button", { name: "Move ingredient 1 down" })).toHaveProperty("disabled", false);
  });

  it("keeps mapper state and new mappings attached to the moved ingredient", async () => {
    const user = userEvent.setup();
    render(<RecipeForm mode="edit" initial={initial} allTags={[]} />);
    const eggsRow = screen.getByRole("textbox", { name: "Ingredient 3 name" }).closest("li")!;
    const mapper = within(eggsRow).getByRole("button", { name: "Eggs" });
    await user.click(mapper);
    const search = screen.getByPlaceholderText("Search ingredients...");
    await user.type(search, "duck");
    await waitFor(() => expect(searchForPicker).toHaveBeenCalledWith({ query: "duck" }));
    await within(eggsRow).findByRole("button", { name: /Duck eggs/ });

    await user.click(screen.getByRole("button", { name: "Move ingredient 3 up" }));
    await user.click(screen.getByRole("button", { name: "Move ingredient 2 up" }));
    await user.click(within(eggsRow).getByRole("button", { name: "Eggs" }));

    expect(within(eggsRow).getByRole("button", { name: "Eggs" })).toBe(mapper);
    expect(screen.getByPlaceholderText("Search ingredients...")).toHaveProperty("value", "duck");
    await user.click(within(eggsRow).getByRole("button", { name: /Duck eggs/ }));
    await user.click(screen.getByRole("button", { name: "Remove ingredient 3" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update.mock.calls[0][0].ingredientsStructured).toEqual([
      { sortOrder: 0, displayText: "Eggs", rawText: "3 large eggs", quantity: 3, unit: "COUNT", ingredientId: "duck-eggs-id" },
      { sortOrder: 1, displayText: "Flour", rawText: "1 1/2 cups flour, sifted", quantity: 1.5, unit: "CUP", ingredientId: "flour-id" },
    ]);
  });

  it("locks ordering during a save and retains it after a network failure", async () => {
    const user = userEvent.setup();
    let rejectSave: (reason: unknown) => void;
    update.mockReturnValueOnce(new Promise((_, reject) => { rejectSave = reject; }));
    render(<RecipeForm mode="edit" initial={initial} allTags={[]} />);
    await user.click(screen.getByRole("button", { name: "Move step 3 up" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    for (const name of ["Ingredients", "Instructions"]) {
      const list = screen.getByRole("list", { name });
      for (const button of within(list).getAllByRole("button")) {
        expect(button.matches(":disabled")).toBe(true);
      }
    }
    expect(screen.getByRole("button", { name: "Add step" })).toHaveProperty("disabled", true);
    rejectSave!(new TypeError("Network unavailable"));

    expect((await screen.findByRole("alert")).textContent).toBe("Could not save recipe. Please try again.");
    expect(screen.getByRole("textbox", { name: "Step 2" })).toHaveProperty("value", "Cook until tender.");
    await user.click(screen.getByRole("button", { name: "Move step 2 up" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update.mock.calls[1][0].instructions).toEqual(["Cook until tender.", "Mix the dough."]);
  });
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
