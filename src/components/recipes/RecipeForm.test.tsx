// @vitest-environment jsdom

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DatabaseSync } from "node:sqlite";

import { recipeIngredient } from "@/db";
import { createTestDb } from "@/test/d1";
import { createTextOnlyRecipe } from "@/features/recipes/create-text-recipe";
import { formatQuantityForInput } from "@/lib/quantity/quantity";
import RecipeForm, { type RecipeFormInitial, type RecipeFormMode } from "./RecipeForm";

const { create, update, searchForPicker } = vi.hoisted(() => ({
  create: vi.fn(), update: vi.fn(), searchForPicker: vi.fn(),
}));
vi.mock("astro:actions", () => ({
  actions: { recipes: { create, update }, ingredients: { searchForPicker } },
}));

const validInitial: RecipeFormInitial = {
  title: "Weeknight pasta",
  sourceUrl: "", imageUrl: "", servings: "", prepTimeMinutes: "",
  cookTimeMinutes: "", totalTimeMinutes: "", notes: "", tagIds: [],
  instructions: ["Mix and cook."],
  ingredients: [{
    displayText: "flour", quantityText: "2", unit: "CUP",
    rawText: " 2 cups flour ", ingredientId: null,
  }],
};

function renderForm(mode: RecipeFormMode = "create", initial: RecipeFormInitial = validInitial) {
  return render(<RecipeForm mode={mode} initial={{ id: "recipe-123", ...initial }} allTags={[]} />);
}

async function selectUnit(user: ReturnType<typeof userEvent.setup>, name: string, row = 0) {
  await user.click(screen.getAllByRole("combobox", { name: "Unit" })[row]);
  await user.click(await screen.findByRole("option", { name }));
}

const originalHasPointerCapture = HTMLElement.prototype.hasPointerCapture;
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
beforeAll(() => {
  // Radix Select uses browser APIs that jsdom does not implement.
  HTMLElement.prototype.hasPointerCapture = () => false;
  HTMLElement.prototype.scrollIntoView = () => {};
});
afterAll(() => {
  HTMLElement.prototype.hasPointerCapture = originalHasPointerCapture;
  HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
});

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
    data: [
      { id: "ingredient-flour", name: "Flour", source: "global" },
      { id: "duck-eggs-id", name: "Duck eggs", source: "global" },
    ],
    error: undefined,
  });
});

afterEach(() => {
  cleanup();
  sqlite?.close();
  sqlite = undefined;
  vi.resetAllMocks();
});

it.each<RecipeFormMode>(["create", "edit"])("requires quantity and unit in %s mode, then saves the reviewed strings", async (mode) => {
  const user = userEvent.setup();
  renderForm(mode, {
    ...validInitial,
    ingredients: [{
      displayText: "salt to taste", quantityText: "", unit: "",
      rawText: " Salt to taste ", ingredientId: null,
    }],
  });
  const save = screen.getByRole("button", { name: mode === "create" ? "Create recipe" : "Save changes" });
  const quantity = screen.getByLabelText("Quantity");
  const unit = screen.getByRole("combobox", { name: "Unit" });
  expect(quantity).toHaveProperty("value", "");
  expect(quantity).toHaveProperty("required", true);
  expect(quantity.getAttribute("aria-required")).toBe("true");
  expect(unit.getAttribute("aria-required")).toBe("true");
  expect(screen.getByLabelText("Ingredient name")).toHaveProperty("value", "salt to taste");

  await user.click(save);
  expect(screen.getByRole("alert").textContent).toBe('Quantity is required for "salt to taste".');
  await waitFor(() => expect(document.activeElement).toBe(quantity));
  expect(quantity.getAttribute("aria-invalid")).toBe("true");
  expect(quantity.getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id);
  expect(create).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
  expect(save).toHaveProperty("disabled", false);

  await user.type(quantity, "1");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(quantity.getAttribute("aria-invalid")).toBe("false");
  await user.click(save);
  expect(screen.getByRole("alert").textContent).toBe('Choose a unit for "salt to taste".');
  await waitFor(() => expect(document.activeElement).toBe(unit));
  expect(unit.getAttribute("aria-invalid")).toBe("true");
  expect(unit.getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id);
  expect(create).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();

  await selectUnit(user, "cup");
  expect(screen.queryByRole("alert")).toBeNull();
  await selectUnit(user, "Select unit");
  await user.click(save);
  expect(screen.getByRole("alert").textContent).toBe('Choose a unit for "salt to taste".');
  await selectUnit(user, "tsp");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(unit.getAttribute("aria-invalid")).toBe("false");
  await user.click(save);

  const action = mode === "create" ? create : update;
  expect(action).toHaveBeenCalledOnce();
  expect(action.mock.calls[0][0]).toMatchObject({
    ingredientsStructured: [{
      displayText: "salt to taste", rawText: " Salt to taste ",
      quantity: 1, unit: "TSP", ingredientId: "", sortOrder: 0,
    }],
  });
  if (mode === "edit") expect(action.mock.calls[0][0].id).toBe("recipe-123");
});

it.each(["1/0", "-1", "not a number", "NaN", "Infinity"])("rejects quantity %s instead of submitting null, then allows a fraction", async (invalidQuantity) => {
  const user = userEvent.setup();
  renderForm("edit");
  const quantity = screen.getByLabelText("Quantity");
  await user.clear(quantity);
  await user.type(quantity, invalidQuantity);
  await user.click(screen.getByRole("button", { name: "Save changes" }));

  expect(screen.getByRole("alert").textContent).toBe('Quantity for "flour" must be a valid number or fraction that is 0 or greater.');
  await waitFor(() => expect(document.activeElement).toBe(quantity));
  expect(quantity.getAttribute("aria-invalid")).toBe("true");
  expect(quantity.getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id);
  expect(quantity).toHaveProperty("value", invalidQuantity);
  expect(update).not.toHaveBeenCalled();

  await user.clear(quantity);
  await user.type(quantity, "1/64");
  expect(screen.queryByRole("alert")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(update.mock.calls[0][0].ingredientsStructured).toEqual([{
    displayText: "flour", rawText: " 2 cups flour ", quantity: 1 / 64,
    unit: "CUP", ingredientId: "", sortOrder: 0,
  }]);
  expect(quantity).toHaveProperty("value", "1/64");
});

it.each(["name", "quantity", "unit", "mapping"])("retains an added row containing only a %s for validation and clears its errors on removal", async (field) => {
  const user = userEvent.setup();
  renderForm();
  await user.click(screen.getByRole("button", { name: "Add ingredient" }));
  if (field === "name") {
    await user.type(screen.getAllByLabelText("Ingredient name")[1], "saffron");
  } else if (field === "quantity") {
    await user.type(screen.getAllByLabelText("Quantity")[1], "1/2");
  } else if (field === "unit") {
    await selectUnit(user, "tsp", 1);
  } else {
    await user.click(screen.getAllByRole("button", { name: /Unmapped.*click to map/ })[1]);
    await user.type(screen.getByPlaceholderText("Search ingredients..."), "flour");
    await user.click(await screen.findByRole("button", { name: /Flour.*global/ }));
  }
  await user.click(screen.getByRole("button", { name: "Create recipe" }));

  expect(create).not.toHaveBeenCalled();
  const invalidField = field === "quantity"
    ? screen.getAllByRole("combobox", { name: "Unit" })[1]
    : screen.getAllByLabelText("Quantity")[1];
  await waitFor(() => expect(document.activeElement).toBe(invalidField));
  expect(invalidField.getAttribute("aria-invalid")).toBe("true");
  expect(invalidField.getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id);

  await user.click(screen.getByRole("button", { name: "Remove ingredient 2" }));
  expect(screen.queryByRole("alert")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Create recipe" }));
  expect(create.mock.calls[0][0].ingredientsStructured).toHaveLength(1);
});

it("retains a raw-text-only row for validation", async () => {
  const user = userEvent.setup();
  renderForm("create", {
    ...validInitial,
    ingredients: [{ displayText: "", quantityText: "", unit: "", rawText: "salt to taste", ingredientId: null }],
  });
  await user.click(screen.getByRole("button", { name: "Create recipe" }));
  expect(screen.getByRole("alert").textContent).toBe('Quantity is required for "salt to taste".');
  expect(create).not.toHaveBeenCalled();
});

it("requires correction of an existing completely empty row instead of silently dropping it", async () => {
  const user = userEvent.setup();
  renderForm("edit", {
    ...validInitial,
    ingredients: [{ displayText: "", quantityText: "", unit: "", rawText: null, ingredientId: null }],
  });
  await user.click(screen.getByRole("button", { name: "Save changes" }));
  expect(screen.getByRole("alert").textContent).toBe('Quantity is required for "ingredient 1".');
  expect(update).not.toHaveBeenCalled();
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Quantity")));
});

it("keeps measurement requirements when a catalog mapping is selected or cleared", async () => {
  const user = userEvent.setup();
  renderForm("create", {
    ...validInitial,
    ingredients: [{ ...validInitial.ingredients[0], quantityText: "" }],
  });
  await user.click(screen.getByRole("button", { name: /Unmapped.*click to map/ }));
  await user.type(screen.getByPlaceholderText("Search ingredients..."), "flour");
  await user.click(await screen.findByRole("button", { name: /Flour.*global/ }));
  await user.click(screen.getByRole("button", { name: "Create recipe" }));
  expect(screen.getByRole("alert").textContent).toBe('Quantity is required for "flour".');
  expect(create).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Flour" }));
  await user.click(screen.getByRole("button", { name: "Clear mapping" }));
  expect(screen.queryByRole("alert")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Create recipe" }));
  expect(screen.getByRole("alert").textContent).toBe('Quantity is required for "flour".');
  expect(create).not.toHaveBeenCalled();
  await user.type(screen.getByLabelText("Quantity"), "1/2");
  await user.click(screen.getByRole("button", { name: "Create recipe" }));
  expect(create.mock.calls[0][0].ingredientsStructured[0]).toMatchObject({
    ingredientId: "", quantity: 0.5, unit: "CUP", rawText: " 2 cups flour ", displayText: "flour",
  });
});

it("ignores only the blank added row and preserves explicit zero, count, and decimal measurements", async () => {
  const user = userEvent.setup();
  const ingredients: RecipeFormInitial["ingredients"] = [
    { ...validInitial.ingredients[0], quantityText: "1.2345", unit: "G" },
    { displayText: "eggs", quantityText: "3", unit: "COUNT", rawText: "3 eggs", ingredientId: null },
    { displayText: "salt to taste", quantityText: "0", unit: "TSP", rawText: "salt to taste", ingredientId: null },
  ];
  renderForm("create", { ...validInitial, ingredients });
  await user.click(screen.getByRole("button", { name: "Add ingredient" }));
  await user.click(screen.getByRole("button", { name: "Create recipe" }));

  expect(create.mock.calls[0][0].ingredientsStructured).toEqual(
    ingredients.map((row, sortOrder) => ({
      displayText: row.displayText, rawText: row.rawText, unit: row.unit,
      quantity: [1.2345, 3, 0][sortOrder], ingredientId: "", sortOrder,
    })),
  );
});

it.each<RecipeFormMode>(["create", "edit"])("guards duplicate %s submissions and allows retry after an action error", async (mode) => {
  const user = userEvent.setup();
  const action = mode === "create" ? create : update;
  let resolveSave: ((result: { error: { message: string } }) => void) | undefined;
  action.mockReturnValueOnce(new Promise((resolve) => { resolveSave = resolve; }));
  renderForm(mode);
  const save = screen.getByRole("button", { name: mode === "create" ? "Create recipe" : "Save changes" });
  await user.click(save);
  expect(action).toHaveBeenCalledOnce();
  expect(save).toHaveProperty("disabled", true);
  const form = save.closest("form");
  if (!form) throw new Error("Recipe form is missing");
  fireEvent.submit(form);
  expect(action).toHaveBeenCalledOnce();

  await act(async () => { resolveSave?.({ error: { message: "Please try again" } }); });
  expect(screen.getByRole("alert").textContent).toBe("Please try again");
  expect(save).toHaveProperty("disabled", false);
  await user.click(save);
  expect(action).toHaveBeenCalledTimes(2);
});

describe("RecipeForm ordering", () => {
  it.each(["create", "edit"] as const)("serializes the new order in %s mode without losing ingredient details", async (mode) => {
    const user = userEvent.setup();
    render(<RecipeForm mode={mode} initial={initial} allTags={[]} />);
    const eggs = screen.getByRole("textbox", { name: "Ingredient 2 name" });

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
    const eggsRow = screen.getByRole("textbox", { name: "Ingredient 2 name" }).closest("li")!;
    const mapper = within(eggsRow).getByRole("button", { name: "Eggs" });
    await user.click(mapper);
    const search = screen.getByPlaceholderText("Search ingredients...");
    await user.type(search, "duck");
    await waitFor(() => expect(searchForPicker).toHaveBeenCalledWith({ query: "duck" }));
    await within(eggsRow).findByRole("button", { name: /Duck eggs/ });

    await user.click(screen.getByRole("button", { name: "Move ingredient 2 up" }));
    await user.click(within(eggsRow).getByRole("button", { name: "Eggs" }));

    expect(within(eggsRow).getByRole("button", { name: "Eggs" })).toBe(mapper);
    expect(screen.getByPlaceholderText("Search ingredients...")).toHaveProperty("value", "duck");
    await user.click(within(eggsRow).getByRole("button", { name: /Duck eggs/ }));
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
