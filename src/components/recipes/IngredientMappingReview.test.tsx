// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { IngredientMappingReview } from "./IngredientMappingReview";

const { applyRecipe, previewRecipe, searchForPicker, softNavigate } = vi.hoisted(
  () => ({
    applyRecipe: vi.fn(),
    previewRecipe: vi.fn(),
    searchForPicker: vi.fn(),
    softNavigate: vi.fn(),
  }),
);

vi.mock("astro:actions", () => ({
  actions: {
    ingredientMapping: { applyRecipe, previewRecipe },
    ingredients: { searchForPicker },
  },
}));

vi.mock("@/lib/navigate", () => ({ softNavigate }));

const preview = {
  recipeId: "recipe-123",
  automaticMappingWarning: null,
  items: [
    {
      recipeIngredientId: "row-current",
      recipeIngredientUpdatedAt: 1_700_000_000_001,
      rawText: "2 cups flour",
      displayText: "flour",
      quantity: 2,
      unit: "CUP" as const,
      currentIngredient: { id: "ingredient-flour", name: "Flour" },
      normalizedKey: "flour",
      suggestedIngredient: {
        id: "ingredient-flour",
        name: "Flour",
        normalizedName: "flour",
        matchType: "current" as const,
      },
      suggestedCreateName: "Bread flour",
      candidates: [],
    },
    {
      recipeIngredientId: "row-existing",
      recipeIngredientUpdatedAt: 1_700_000_000_002,
      rawText: "3 tomatoes",
      displayText: "tomatoes",
      quantity: 3,
      unit: "COUNT" as const,
      currentIngredient: null,
      normalizedKey: "tomato",
      suggestedIngredient: {
        id: "ingredient-tomato",
        name: "Tomato",
        normalizedName: "tomato",
        matchType: "llm" as const,
      },
      suggestedCreateName: "Tomatoes",
      candidates: [],
    },
    {
      recipeIngredientId: "row-create",
      recipeIngredientUpdatedAt: 1_700_000_000_003,
      rawText: "1 bunch scallions",
      displayText: "scallions",
      quantity: 1,
      unit: "COUNT" as const,
      currentIngredient: null,
      normalizedKey: "scallion",
      suggestedIngredient: null,
      suggestedCreateName: "Scallion",
      candidates: [],
    },
    {
      recipeIngredientId: "row-unmapped",
      recipeIngredientUpdatedAt: 1_700_000_000_004,
      rawText: "salt to taste",
      displayText: "salt to taste",
      quantity: null,
      unit: null,
      currentIngredient: null,
      normalizedKey: "salt to taste",
      suggestedIngredient: null,
      suggestedCreateName: null,
      candidates: [],
    },
  ],
};

function getRow(rawText: string) {
  const heading = screen.getByRole("heading", { name: rawText });
  const row = heading.closest("article");
  if (!row) throw new Error(`Could not find row for ${rawText}`);
  return within(row);
}

beforeEach(() => {
  previewRecipe.mockResolvedValue({ data: preview, error: undefined });
  applyRecipe.mockResolvedValue({
    data: { recipeId: "recipe-123", mappedCount: 3, totalCount: 4 },
    error: undefined,
  });
  searchForPicker.mockResolvedValue({ data: [], error: undefined });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("IngredientMappingReview", () => {
  it("shows loading and then a preview error", async () => {
    let resolvePreview:
      | ((result: { data?: typeof preview; error?: { message: string } }) => void)
      | undefined;
    previewRecipe.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePreview = resolve;
      }),
    );

    render(
      <IngredientMappingReview
        recipeId="recipe-123"
        recipeTitle="Weeknight pasta"
      />,
    );

    expect(screen.getByRole("status").textContent).toContain(
      "Loading ingredient mappings",
    );

    resolvePreview?.({ error: { message: "Preview unavailable" } });

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Preview unavailable",
    );
  });

  it("uses current, suggested existing, suggested create, and unmapped precedence", async () => {
    render(
      <IngredientMappingReview
        recipeId="recipe-123"
        recipeTitle="Weeknight pasta"
      />,
    );

    await screen.findByRole("heading", { name: "2 cups flour" });
    const current = getRow("2 cups flour");
    expect(
      (current.getByRole("radio", { name: "Existing catalog ingredient" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(current.getByText("Current mapping")).toBeTruthy();
    expect((current.getByLabelText("Selected ingredient") as HTMLInputElement).value).toBe(
      "Flour",
    );

    const existing = getRow("3 tomatoes");
    expect(
      (existing.getByRole("radio", { name: "Existing catalog ingredient" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(existing.getByText("AI suggestion")).toBeTruthy();
    expect((existing.getByLabelText("Selected ingredient") as HTMLInputElement).value).toBe(
      "Tomato",
    );

    const create = getRow("1 bunch scallions");
    expect(
      (create.getByRole("radio", { name: "Create ingredient" }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(create.getByText("Create suggestion")).toBeTruthy();
    expect((create.getByLabelText("New ingredient name") as HTMLInputElement).value).toBe(
      "Scallion",
    );

    const unmapped = getRow("salt to taste");
    expect(
      (unmapped.getByRole("radio", { name: "Leave unmapped" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });

  it("shows a warning when automatic AI suggestions are unavailable", async () => {
    previewRecipe.mockResolvedValueOnce({
      data: {
        ...preview,
        automaticMappingWarning:
          "Automatic AI suggestions are temporarily unavailable. Deterministic matches are still shown; review the remaining ingredients manually.",
      },
      error: undefined,
    });

    render(
      <IngredientMappingReview
        recipeId="recipe-123"
        recipeTitle="Weeknight pasta"
      />,
    );

    expect(
      await screen.findByText(/Automatic AI suggestions are temporarily unavailable/),
    ).toBeTruthy();
  });

  it("applies every row and navigates to the recipe", async () => {
    const user = userEvent.setup();
    render(
      <IngredientMappingReview
        recipeId="recipe-123"
        recipeTitle="Weeknight pasta"
      />,
    );
    await screen.findByRole("heading", { name: "2 cups flour" });
    const current = getRow("2 cups flour");

    await user.clear(current.getByLabelText("Display text"));
    await user.type(current.getByLabelText("Display text"), "all-purpose flour");
    await user.clear(current.getByLabelText("Quantity"));
    await user.type(current.getByLabelText("Quantity"), "2 1/2");
    await user.selectOptions(current.getByLabelText("Unit"), "KG");
    await user.click(screen.getByRole("button", { name: "Apply mappings" }));

    await waitFor(() => {
      expect(applyRecipe).toHaveBeenCalledWith({
        recipeId: "recipe-123",
        items: [
          {
            recipeIngredientId: "row-current",
            recipeIngredientUpdatedAt: 1_700_000_000_001,
            displayText: "all-purpose flour",
            quantity: 2.5,
            unit: "KG",
            mapping: {
              kind: "existing",
              ingredientId: "ingredient-flour",
            },
          },
          {
            recipeIngredientId: "row-existing",
            recipeIngredientUpdatedAt: 1_700_000_000_002,
            displayText: "tomatoes",
            quantity: 3,
            unit: "COUNT",
            mapping: {
              kind: "existing",
              ingredientId: "ingredient-tomato",
            },
          },
          {
            recipeIngredientId: "row-create",
            recipeIngredientUpdatedAt: 1_700_000_000_003,
            displayText: "scallions",
            quantity: 1,
            unit: "COUNT",
            mapping: { kind: "create", name: "Scallion" },
          },
          {
            recipeIngredientId: "row-unmapped",
            recipeIngredientUpdatedAt: 1_700_000_000_004,
            displayText: "salt to taste",
            quantity: null,
            unit: null,
            mapping: { kind: "unmapped" },
          },
        ],
      });
      expect(softNavigate).toHaveBeenCalledWith("/recipes/recipe-123");
    });
  });

  it("searches the catalog with listbox semantics and applies a keyboard selection", async () => {
    const user = userEvent.setup();
    searchForPicker
      .mockResolvedValueOnce({ data: [], error: undefined })
      .mockResolvedValueOnce({
        data: [{ id: "ingredient-oats", name: "Oats", source: "custom" }],
        error: undefined,
      });
    render(
      <IngredientMappingReview
        recipeId="recipe-123"
        recipeTitle="Weeknight pasta"
      />,
    );
    await screen.findByRole("heading", { name: "2 cups flour" });
    const current = getRow("2 cups flour");
    const search = current.getByRole("combobox", {
      name: "Search ingredient catalog",
    });

    await user.type(search, "zz");
    await waitFor(() =>
      expect(searchForPicker).toHaveBeenCalledWith({ query: "zz" }),
    );
    expect(await current.findByText("No ingredients found.")).toBeTruthy();
    expect(current.queryByRole("listbox")).toBeNull();
    expect(search.getAttribute("aria-expanded")).toBe("false");

    await user.clear(search);
    await user.type(search, "oat");
    const option = await current.findByRole("option", { name: /Oats/ });
    expect(option.tabIndex).toBe(-1);
    expect(current.getByRole("listbox")).toBeTruthy();
    expect(search.getAttribute("aria-expanded")).toBe("true");

    await user.keyboard("{ArrowDown}{Enter}");

    expect(
      (current.getByLabelText("Selected ingredient") as HTMLInputElement)
        .value,
    ).toBe("Oats");
    expect(current.queryByRole("listbox")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Apply mappings" }));
    await waitFor(() => {
      const items = applyRecipe.mock.calls[0]?.[0].items;
      expect(items[0].mapping).toEqual({
        kind: "existing",
        ingredientId: "ingredient-oats",
      });
    });
  });

  it("ignores a stale catalog response after the query changes", async () => {
    const user = userEvent.setup();
    let resolveFirstSearch:
      | ((result: {
          data: { id: string; name: string; source: "global" }[];
          error?: undefined;
        }) => void)
      | undefined;
    searchForPicker.mockReset();
    searchForPicker
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirstSearch = resolve;
        }),
      )
      .mockResolvedValueOnce({
        data: [{ id: "ingredient-rice", name: "Rice", source: "global" }],
        error: undefined,
      });
    render(
      <IngredientMappingReview
        recipeId="recipe-123"
        recipeTitle="Weeknight pasta"
      />,
    );
    await screen.findByRole("heading", { name: "2 cups flour" });
    const current = getRow("2 cups flour");
    const search = current.getByRole("combobox", {
      name: "Search ingredient catalog",
    });

    await user.type(search, "ri");
    await waitFor(() => expect(searchForPicker).toHaveBeenCalledTimes(1));
    await user.type(search, "ce");
    expect(await current.findByRole("option", { name: /Rice/ })).toBeTruthy();

    resolveFirstSearch?.({
      data: [{ id: "ingredient-ricotta", name: "Ricotta", source: "global" }],
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(current.queryByRole("option", { name: /Ricotta/ })).toBeNull();
    expect(current.getByRole("option", { name: /Rice/ })).toBeTruthy();
  });

  it("supports manual create and unmapped choices", async () => {
    const user = userEvent.setup();
    render(
      <IngredientMappingReview
        recipeId="recipe-123"
        recipeTitle="Weeknight pasta"
      />,
    );
    await screen.findByRole("heading", { name: "2 cups flour" });
    const current = getRow("2 cups flour");
    const create = getRow("1 bunch scallions");

    await user.click(current.getByRole("radio", { name: "Create ingredient" }));
    await user.clear(current.getByLabelText("New ingredient name"));
    await user.type(current.getByLabelText("New ingredient name"), "Cake flour");
    await user.click(create.getByRole("radio", { name: "Leave unmapped" }));
    await user.click(screen.getByRole("button", { name: "Apply mappings" }));

    await waitFor(() => {
      const items = applyRecipe.mock.calls[0]?.[0].items;
      expect(items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            recipeIngredientId: "row-current",
            mapping: { kind: "create", name: "Cake flour" },
          }),
          expect.objectContaining({
            recipeIngredientId: "row-create",
            mapping: { kind: "unmapped" },
          }),
        ]),
      );
    });
  });

  it("guards duplicate applies and recovers from an action error", async () => {
    const user = userEvent.setup();
    let resolveApply:
      | ((result: { data?: unknown; error?: { message: string } }) => void)
      | undefined;
    applyRecipe.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveApply = resolve;
      }),
    );
    render(
      <IngredientMappingReview
        recipeId="recipe-123"
        recipeTitle="Weeknight pasta"
      />,
    );
    const apply = await screen.findByRole("button", { name: "Apply mappings" });

    await user.click(apply);
    expect(applyRecipe).toHaveBeenCalledTimes(1);
    expect(apply).toHaveProperty("disabled", true);
    expect(screen.queryByRole("link", { name: "Cancel" })).toBeNull();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveProperty(
      "disabled",
      true,
    );

    await user.click(apply);
    expect(applyRecipe).toHaveBeenCalledTimes(1);

    resolveApply?.({ error: { message: "Could not apply mappings" } });

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Could not apply mappings",
    );
    expect(apply).toHaveProperty("disabled", false);
    expect(screen.getByRole("link", { name: "Cancel" })).toBeTruthy();
    expect(softNavigate).not.toHaveBeenCalled();

    await user.click(apply);
    await waitFor(() => {
      expect(applyRecipe).toHaveBeenCalledTimes(2);
      expect(softNavigate).toHaveBeenCalledWith("/recipes/recipe-123");
    });
  });

  it("does not apply when cancel is clicked", async () => {
    const user = userEvent.setup();
    render(
      <IngredientMappingReview
        recipeId="recipe-123"
        recipeTitle="Weeknight pasta"
      />,
    );
    const cancel = await screen.findByRole("link", { name: "Cancel" });
    cancel.addEventListener("click", (event) => event.preventDefault());

    await user.click(cancel);

    expect(cancel.getAttribute("href")).toBe("/recipes/recipe-123");
    expect(applyRecipe).not.toHaveBeenCalled();
  });

  it("validates display text, quantity, and create names before applying", async () => {
    const user = userEvent.setup();
    render(
      <IngredientMappingReview
        recipeId="recipe-123"
        recipeTitle="Weeknight pasta"
      />,
    );
    await screen.findByRole("heading", { name: "2 cups flour" });
    const current = getRow("2 cups flour");

    const displayText = current.getByLabelText("Display text");
    await user.clear(displayText);
    await user.click(screen.getByRole("button", { name: "Apply mappings" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      'Display text is required for "2 cups flour"',
    );
    await waitFor(() => expect(document.activeElement).toBe(displayText));
    expect(displayText.getAttribute("aria-invalid")).toBe("true");
    expect(applyRecipe).not.toHaveBeenCalled();

    await user.type(displayText, "flour");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(displayText.getAttribute("aria-invalid")).not.toBe("true");
    const quantity = current.getByLabelText("Quantity");
    await user.clear(quantity);
    await user.type(quantity, "not a number");
    await user.click(screen.getByRole("button", { name: "Apply mappings" }));
    expect(screen.getByRole("alert").textContent).toContain(
      'Quantity for "2 cups flour" must be a valid number or fraction that is 0 or greater',
    );
    await waitFor(() => expect(document.activeElement).toBe(quantity));
    expect(quantity.getAttribute("aria-invalid")).toBe("true");

    await user.clear(quantity);
    const create = getRow("1 bunch scallions");
    const createName = create.getByLabelText("New ingredient name");
    await user.clear(createName);
    await user.click(screen.getByRole("button", { name: "Apply mappings" }));
    expect(screen.getByRole("alert").textContent).toContain(
      'New ingredient name is required for "1 bunch scallions"',
    );
    await waitFor(() => expect(document.activeElement).toBe(createName));
    expect(createName.getAttribute("aria-invalid")).toBe("true");

    await user.type(createName, "Scallion");
    const unmapped = getRow("salt to taste");
    await user.click(
      unmapped.getByRole("radio", { name: "Existing catalog ingredient" }),
    );
    await user.click(screen.getByRole("button", { name: "Apply mappings" }));
    const ingredientSearch = unmapped.getByRole("combobox", {
      name: "Search ingredient catalog",
    });
    expect(screen.getByRole("alert").textContent).toContain(
      'Choose an existing ingredient for "salt to taste"',
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(ingredientSearch),
    );
    expect(ingredientSearch.getAttribute("aria-invalid")).toBe("true");
    expect(ingredientSearch.getAttribute("aria-describedby")).toBe(
      screen.getByRole("alert").id,
    );
    expect(applyRecipe).not.toHaveBeenCalled();
  });

  it("clears stale rows and validation state when the recipe changes", async () => {
    const user = userEvent.setup();
    const secondPreview = {
      recipeId: "recipe-456",
      items: [
        {
          ...preview.items[3],
          recipeIngredientId: "row-lemon",
          rawText: "1 lemon",
          displayText: "lemon",
        },
      ],
    };
    let resolveSecondPreview:
      | ((result: {
          data?: typeof secondPreview;
          error?: { message: string };
        }) => void)
      | undefined;
    previewRecipe.mockReset();
    previewRecipe
      .mockResolvedValueOnce({ data: preview, error: undefined })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveSecondPreview = resolve;
        }),
      );
    const { rerender } = render(
      <IngredientMappingReview
        recipeId="recipe-123"
        recipeTitle="Weeknight pasta"
      />,
    );
    await screen.findByRole("heading", { name: "2 cups flour" });
    const displayText = getRow("2 cups flour").getByLabelText("Display text");
    await user.clear(displayText);
    await user.click(screen.getByRole("button", { name: "Apply mappings" }));
    await screen.findByRole("alert");

    rerender(
      <IngredientMappingReview recipeId="recipe-456" recipeTitle="Lemon tea" />,
    );

    expect(screen.getByRole("status").textContent).toContain("Lemon tea");
    expect(screen.queryByRole("heading", { name: "2 cups flour" })).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();

    resolveSecondPreview?.({ data: secondPreview });
    expect(await screen.findByRole("heading", { name: "1 lemon" })).toBeTruthy();
    expect(previewRecipe).toHaveBeenLastCalledWith({ recipeId: "recipe-456" });
  });
});
