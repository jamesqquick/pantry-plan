// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RecipeDraftEditor, type RecipeDraft } from "./RecipeDraftEditor";

const { ingredientLines, saveTextOnly, softNavigate } = vi.hoisted(() => ({
  ingredientLines: vi.fn(),
  saveTextOnly: vi.fn(),
  softNavigate: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    enhance: { ingredientLines },
    recipeImport: { saveTextOnly },
  },
}));

vi.mock("@/lib/navigate", () => ({ softNavigate }));

const validDraft: RecipeDraft = {
  title: "Weeknight Pasta",
  sourceUrl: "https://example.com/pasta",
  imageUrl: "",
  servings: 4,
  prepTimeMinutes: 10,
  cookTimeMinutes: 20,
  totalTimeMinutes: 30,
  ingredients: [" 2 cups flour ", "", "3 eggs"],
  instructions: ["Mix the dough.", "Cook until tender."],
  notes: "Serve warm.",
};

function renderEditor(draft: RecipeDraft = validDraft) {
  return render(
    <RecipeDraftEditor draft={draft} onBack={vi.fn()} allTags={[]} />,
  );
}

beforeEach(() => {
  ingredientLines.mockResolvedValue({ data: { items: [] }, error: undefined });
  saveTextOnly.mockResolvedValue({
    data: { recipeId: "recipe-123" },
    error: undefined,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RecipeDraftEditor", () => {
  it("does not request ingredient mapping on render", () => {
    renderEditor();

    expect(ingredientLines).not.toHaveBeenCalled();
  });

  it("starts without mapping UI and enables the save actions", () => {
    renderEditor();

    expect(screen.queryByText(/mapping ingredients/i)).toBeNull();
    expect(screen.queryByText(/\d+\/\d+ mapped/i)).toBeNull();
    expect(
      screen.queryByRole("button", { name: /re-map ingredients/i }),
    ).toBeNull();
    expect(screen.queryByText(/auto-map/i)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Save recipe" }),
    ).toHaveProperty("disabled", false);
    expect(
      screen.getByRole("button", { name: "Save and map" }),
    ).toHaveProperty("disabled", false);
  });

  it("orders imported ingredient inputs as quantity, unit, then ingredient text", () => {
    renderEditor();
    const firstIngredient = screen.getByRole("region", { name: "Ingredients" })
      .querySelector("article");

    expect(
      Array.from(firstIngredient?.querySelectorAll("input, select") ?? []).map(
        (field) => field.getAttribute("aria-label"),
      ),
    ).toEqual([
      "Quantity for ingredient 1",
      "Unit for ingredient 1",
      "Ingredient text for ingredient 1",
    ]);
  });

  it("shows parsed quantity, unit, ingredient text, and the original line", () => {
    renderEditor();

    expect(
      screen.getAllByText("Original line")[0].nextElementSibling?.className,
    ).toContain("italic");
    expect(screen.getAllByText("Original line")[0].parentElement?.textContent).toContain(
      "2 cups flour",
    );
    expect(
      screen.queryByText("Parsed automatically. Check or edit these fields before saving."),
    ).toBeNull();
    expect(screen.getByLabelText("Ingredient text for ingredient 1")).toHaveProperty(
      "value",
      "flour",
    );
    expect(screen.getByLabelText("Quantity for ingredient 1")).toHaveProperty(
      "value",
      "2",
    );
    expect(screen.getByLabelText("Unit for ingredient 1")).toHaveProperty(
      "value",
      "CUP",
    );
    expect(screen.getByLabelText("Quantity for ingredient 2")).toHaveProperty(
      "value",
      "3",
    );
    expect(screen.getByLabelText("Unit for ingredient 2")).toHaveProperty(
      "value",
      "COUNT",
    );
  });

  it("highlights every missing imported measurement immediately and clears each highlight as it is completed", async () => {
    const user = userEvent.setup();
    renderEditor({
      ...validDraft,
      ingredients: ["2 cups flour", "Salt to taste", "1 cup flour (120 g)"],
    });

    const parsedQuantity = screen.getByLabelText("Quantity for ingredient 1");
    const parsedUnit = screen.getByLabelText("Unit for ingredient 1");
    const saltQuantity = screen.getByLabelText("Quantity for ingredient 2");
    const saltUnit = screen.getByLabelText("Unit for ingredient 2");
    const ambiguousQuantity = screen.getByLabelText("Quantity for ingredient 3");
    const ambiguousUnit = screen.getByLabelText("Unit for ingredient 3");

    expect(parsedQuantity.getAttribute("aria-invalid")).toBe("false");
    expect(parsedUnit.getAttribute("aria-invalid")).toBe("false");
    for (const field of [saltQuantity, saltUnit, ambiguousQuantity, ambiguousUnit]) {
      expect(field.getAttribute("aria-invalid")).toBe("true");
    }
    expect(saltUnit.className).toContain("aria-invalid:border-destructive");
    expect(screen.queryByRole("alert")).toBeNull();

    await user.type(saltQuantity, "1");
    expect(saltQuantity.getAttribute("aria-invalid")).toBe("false");
    expect(saltUnit.getAttribute("aria-invalid")).toBe("true");

    await user.selectOptions(saltUnit, "TSP");
    expect(saltQuantity.getAttribute("aria-invalid")).toBe("false");
    expect(saltUnit.getAttribute("aria-invalid")).toBe("false");
    expect(ambiguousQuantity.getAttribute("aria-invalid")).toBe("true");
    expect(ambiguousUnit.getAttribute("aria-invalid")).toBe("true");
  });

  it("leaves the blank ingredient placeholder unhighlighted", () => {
    renderEditor({ ...validDraft, ingredients: [] });

    expect(screen.getByLabelText("Quantity for ingredient 1").getAttribute("aria-invalid")).toBe("false");
    expect(screen.getByLabelText("Unit for ingredient 1").getAttribute("aria-invalid")).toBe("false");
  });

  it("keeps small fractions and metric decimals precise through the reviewed save", async () => {
    const user = userEvent.setup();
    renderEditor({
      ...validDraft,
      ingredients: ["1/64 tsp salt", "1.2345 g flour"],
    });

    expect(screen.getByLabelText("Quantity for ingredient 1")).toHaveProperty(
      "value",
      "0.015625",
    );
    expect(screen.getByLabelText("Quantity for ingredient 2")).toHaveProperty(
      "value",
      "1.2345",
    );
    await user.click(screen.getByRole("button", { name: "Save recipe" }));

    await waitFor(() => {
      expect(saveTextOnly).toHaveBeenCalledWith(
        expect.objectContaining({
          ingredients: [
            { rawText: "1/64 tsp salt", displayText: "salt", quantity: 1 / 64, unit: "TSP" },
            { rawText: "1.2345 g flour", displayText: "flour", quantity: 1.2345, unit: "G" },
          ],
        }),
      );
    });
  });

  it("keeps an ambiguous line intact and lets the user confirm a structured amount", async () => {
    const user = userEvent.setup();
    renderEditor({ ...validDraft, ingredients: ["2-3 cloves garlic"] });

    expect(screen.getByRole("status").textContent).toBe(
      "Couldn't automatically parse ingredient.",
    );
    expect(screen.getByLabelText("Ingredient text for ingredient 1")).toHaveProperty(
      "value",
      "2-3 cloves garlic",
    );
    expect(screen.getByLabelText("Quantity for ingredient 1")).toHaveProperty(
      "value",
      "",
    );

    await user.clear(screen.getByLabelText("Ingredient text for ingredient 1"));
    await user.type(screen.getByLabelText("Ingredient text for ingredient 1"), "cloves garlic");
    await user.type(screen.getByLabelText("Quantity for ingredient 1"), "2");
    await user.selectOptions(screen.getByLabelText("Unit for ingredient 1"), "COUNT");
    expect(screen.getByRole("status").textContent).toBe(
      "Couldn't automatically parse ingredient.",
    );
    await user.click(screen.getByRole("button", { name: "Save recipe" }));

    await waitFor(() => {
      expect(saveTextOnly).toHaveBeenCalledWith(
        expect.objectContaining({
          ingredients: [
            {
              rawText: "2-3 cloves garlic",
              displayText: "cloves garlic",
              quantity: 2,
              unit: "COUNT",
            },
          ],
        }),
      );
    });
  });

  it.each(["Save recipe", "Save and map"])(
    "requires a reviewed measurement for salt to taste before %s",
    async (saveAction) => {
      const user = userEvent.setup();
      renderEditor({ ...validDraft, ingredients: ["Salt to taste"] });
      const quantity = screen.getByLabelText("Quantity for ingredient 1");
      const unit = screen.getByLabelText("Unit for ingredient 1");
      const save = screen.getByRole("button", { name: saveAction });

      expect(screen.getByText("No quantity was detected automatically. Enter a quantity and choose a unit before saving.")).toBeTruthy();
      expect(screen.getByLabelText("Ingredient text for ingredient 1")).toHaveProperty("value", "Salt to taste");
      expect(quantity).toHaveProperty("value", "");
      expect(unit).toHaveProperty("value", "");
      expect(quantity).toHaveProperty("required", true);
      expect(unit).toHaveProperty("required", true);
      expect(quantity.getAttribute("aria-required")).toBe("true");
      expect(unit.getAttribute("aria-required")).toBe("true");
      expect(screen.getByRole("option", { name: "Select unit" })).toHaveProperty("disabled", false);

      await user.click(save);

      expect(screen.getByRole("alert").textContent).toBe('Quantity is required for "Salt to taste".');
      await waitFor(() => expect(document.activeElement).toBe(quantity));
      expect(quantity.getAttribute("aria-invalid")).toBe("true");
      expect(quantity.getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id);
      expect(saveTextOnly).not.toHaveBeenCalled();
      expect(softNavigate).not.toHaveBeenCalled();

      await user.type(quantity, "1");
      expect(screen.queryByRole("alert")).toBeNull();
      expect(quantity.getAttribute("aria-invalid")).toBe("false");
      await user.click(save);

      expect(screen.getByRole("alert").textContent).toBe('Choose a unit for "Salt to taste".');
      await waitFor(() => expect(document.activeElement).toBe(unit));
      expect(unit.getAttribute("aria-invalid")).toBe("true");
      expect(unit.getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id);
      expect(saveTextOnly).not.toHaveBeenCalled();

      await user.selectOptions(unit, "TSP");
      expect(screen.queryByRole("alert")).toBeNull();
      expect(unit.getAttribute("aria-invalid")).toBe("false");
      await user.clear(screen.getByLabelText("Ingredient text for ingredient 1"));
      await user.type(screen.getByLabelText("Ingredient text for ingredient 1"), "salt to taste");
      await user.click(save);

      expect(saveTextOnly).toHaveBeenCalledWith(expect.objectContaining({
        ingredients: [{ rawText: "Salt to taste", displayText: "salt to taste", quantity: 1, unit: "TSP" }],
      }));
      expect(softNavigate).toHaveBeenCalledWith(
        saveAction === "Save and map" ? "/recipes/recipe-123/map-ingredients" : "/recipes/recipe-123",
      );
    },
  );

  it("requires a measurement for an unresolved line and preserves its reviewed text", async () => {
    const user = userEvent.setup();
    renderEditor({ ...validDraft, ingredients: ["1 cup flour (120 g)"] });

    await user.click(screen.getByRole("button", { name: "Save recipe" }));
    expect(screen.getByRole("alert").textContent).toBe('Quantity is required for "1 cup flour (120 g)".');
    expect(saveTextOnly).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Quantity for ingredient 1"), "1");
    await user.selectOptions(screen.getByLabelText("Unit for ingredient 1"), "CUP");
    await user.click(screen.getByRole("button", { name: "Save recipe" }));

    await waitFor(() => {
      expect(saveTextOnly).toHaveBeenCalledWith(
        expect.objectContaining({
          ingredients: [
            {
              rawText: "1 cup flour (120 g)",
              displayText: "1 cup flour (120 g)",
              quantity: 1,
              unit: "CUP",
            },
          ],
        }),
      );
    });
  });

  it.each(["1/0", "-1", "not a number", "NaN", "Infinity"])("rejects quantity %s and allows correction", async (invalidQuantity) => {
    const user = userEvent.setup();
    renderEditor();
    const quantity = screen.getByLabelText("Quantity for ingredient 1");
    await user.clear(quantity);
    await user.type(quantity, invalidQuantity);

    await user.click(screen.getByRole("button", { name: "Save recipe" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      'Quantity for "2 cups flour" must be a valid number or fraction that is 0 or greater.',
    );
    expect(saveTextOnly).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(quantity));
    expect(quantity.getAttribute("aria-invalid")).toBe("true");
    expect(quantity.getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id);
    expect(quantity).toHaveProperty("value", invalidQuantity);

    await user.clear(quantity);
    await user.type(quantity, "1 1/2");
    expect(screen.queryByRole("alert")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save recipe" }));
    expect(saveTextOnly.mock.calls[0][0].ingredients[0]).toEqual({
      rawText: " 2 cups flour ", displayText: "flour", quantity: 1.5, unit: "CUP",
    });
    expect(quantity).toHaveProperty("value", "1 1/2");
  });

  it.each(["name", "quantity", "unit"])("validates an added row containing only a %s and clears errors on removal", async (field) => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Add ingredient" }));
    if (field === "name") {
      await user.type(screen.getByLabelText("Ingredient text for ingredient 3"), "saffron");
    } else if (field === "quantity") {
      await user.type(screen.getByLabelText("Quantity for ingredient 3"), "1/2");
    } else {
      await user.selectOptions(screen.getByLabelText("Unit for ingredient 3"), "TSP");
    }

    await user.click(screen.getByRole("button", { name: "Save recipe" }));
    expect(saveTextOnly).not.toHaveBeenCalled();
    const invalidField = screen.getByLabelText(field === "name" ? "Quantity for ingredient 3" : "Ingredient text for ingredient 3");
    await waitFor(() => expect(document.activeElement).toBe(invalidField));
    expect(invalidField.getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id);

    await user.click(screen.getByRole("button", { name: "Remove ingredient 3" }));
    expect(screen.queryByRole("alert")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save recipe" }));
    expect(saveTextOnly.mock.calls[0][0].ingredients).toHaveLength(2);
  });

  it("does not discard an imported row when all editable fields are cleared", async () => {
    const user = userEvent.setup();
    renderEditor();
    const text = screen.getByLabelText("Ingredient text for ingredient 1");
    await user.clear(text);
    await user.clear(screen.getByLabelText("Quantity for ingredient 1"));
    await user.selectOptions(screen.getByLabelText("Unit for ingredient 1"), "");
    await user.click(screen.getByRole("button", { name: "Save recipe" }));

    expect(saveTextOnly).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe('Ingredient text is required for "2 cups flour".');
    await waitFor(() => expect(document.activeElement).toBe(text));
  });

  it("ignores an entirely blank added row and accepts an explicit zero quantity", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Add ingredient" }));
    await user.clear(screen.getByLabelText("Quantity for ingredient 1"));
    await user.type(screen.getByLabelText("Quantity for ingredient 1"), "0");
    await user.click(screen.getByRole("button", { name: "Save recipe" }));

    expect(saveTextOnly.mock.calls[0][0].ingredients).toEqual([
      { rawText: " 2 cups flour ", displayText: "flour", quantity: 0, unit: "CUP" },
      { rawText: "3 eggs", displayText: "eggs", quantity: 3, unit: "COUNT" },
    ]);
  });

  it("explains the save and map action in a tooltip", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.hover(screen.getByRole("button", { name: "Save and map" }));

    expect((await screen.findByRole("tooltip")).textContent).toBe(
      "Save the recipe, then review and map its ingredients to items in your pantry.",
    );
  });

  it("saves text-only ingredients and navigates to the recipe detail", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Save recipe" }));

    await waitFor(() => {
      expect(saveTextOnly).toHaveBeenCalledWith(
        expect.objectContaining({
          ingredients: [
            { rawText: " 2 cups flour ", displayText: "flour", quantity: 2, unit: "CUP" },
            { rawText: "3 eggs", displayText: "eggs", quantity: 3, unit: "COUNT" },
          ],
        }),
      );
      expect(softNavigate).toHaveBeenCalledWith("/recipes/recipe-123");
    });
  });

  it("saves text-only ingredients and navigates to ingredient mapping", async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Save and map" }));

    await waitFor(() => {
      expect(saveTextOnly).toHaveBeenCalledWith(
        expect.objectContaining({
          ingredients: [
            { rawText: " 2 cups flour ", displayText: "flour", quantity: 2, unit: "CUP" },
            { rawText: "3 eggs", displayText: "eggs", quantity: 3, unit: "COUNT" },
          ],
        }),
      );
      expect(softNavigate).toHaveBeenCalledWith(
        "/recipes/recipe-123/map-ingredients",
      );
    });
  });

  it("allows only one save request while a save is pending", async () => {
    const user = userEvent.setup();
    let resolveSave: ((result: unknown) => void) | undefined;
    saveTextOnly.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    renderEditor();
    const saveRecipe = screen.getByRole("button", { name: "Save recipe" });
    const saveAndMap = screen.getByRole("button", { name: "Save and map" });
    const cancel = screen.getByRole("button", { name: "Cancel" });

    await user.click(saveRecipe);

    expect(saveTextOnly).toHaveBeenCalledTimes(1);
    expect(saveRecipe).toHaveProperty("disabled", true);
    expect(saveAndMap).toHaveProperty("disabled", true);
    expect(cancel).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Add ingredient" })).toHaveProperty(
      "disabled",
      true,
    );

    await user.click(saveRecipe);
    await user.click(saveAndMap);
    expect(saveTextOnly).toHaveBeenCalledTimes(1);

    resolveSave?.({ data: { recipeId: "recipe-123" }, error: undefined });
    await waitFor(() => {
      expect(softNavigate).toHaveBeenCalledWith("/recipes/recipe-123");
      expect(saveRecipe).toHaveProperty("disabled", true);
      expect(saveAndMap).toHaveProperty("disabled", true);
      expect(cancel).toHaveProperty("disabled", true);
    });
  });

  it("recovers from a rejected save and allows a successful retry", async () => {
    const user = userEvent.setup();
    saveTextOnly.mockRejectedValueOnce(new Error("Network unavailable"));
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Save recipe" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Failed to save recipe: Network unavailable",
    );
    expect(
      screen.getByRole("button", { name: "Save recipe" }),
    ).toHaveProperty("disabled", false);
    expect(
      screen.getByRole("button", { name: "Save and map" }),
    ).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveProperty(
      "disabled",
      false,
    );
    expect(softNavigate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save recipe" }));

    await waitFor(() => {
      expect(saveTextOnly).toHaveBeenCalledTimes(2);
      expect(softNavigate).toHaveBeenCalledWith("/recipes/recipe-123");
      expect(
        screen.getByRole("button", { name: "Saving..." }),
      ).toHaveProperty("disabled", true);
      expect(
        screen.getByRole("button", { name: "Save and map" }),
      ).toHaveProperty("disabled", true);
      expect(screen.getByRole("button", { name: "Cancel" })).toHaveProperty(
        "disabled",
        true,
      );
    });
  });

  it("recovers from an action error and allows a successful retry", async () => {
    const user = userEvent.setup();
    saveTextOnly.mockResolvedValueOnce({
      data: undefined,
      error: { message: "Recipe could not be saved" },
    });
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Save recipe" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Recipe could not be saved",
    );
    expect(
      screen.getByRole("button", { name: "Save recipe" }),
    ).toHaveProperty("disabled", false);
    expect(
      screen.getByRole("button", { name: "Save and map" }),
    ).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveProperty(
      "disabled",
      false,
    );
    expect(softNavigate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Save recipe" }));

    await waitFor(() => {
      expect(saveTextOnly).toHaveBeenCalledTimes(2);
      expect(softNavigate).toHaveBeenCalledWith("/recipes/recipe-123");
      expect(
        screen.getByRole("button", { name: "Saving..." }),
      ).toHaveProperty("disabled", true);
    });
  });

  it("does not save an invalid draft", async () => {
    const user = userEvent.setup();
    renderEditor({ ...validDraft, title: "" });

    await user.click(screen.getByRole("button", { name: "Save recipe" }));
    expect(screen.getByText("Title is required.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Save and map" }));
    expect(saveTextOnly).not.toHaveBeenCalled();
    expect(softNavigate).not.toHaveBeenCalled();
  });

  it("does not save a draft without instructions", async () => {
    const user = userEvent.setup();
    renderEditor({ ...validDraft, instructions: [] });

    await user.click(screen.getByRole("button", { name: "Save recipe" }));

    expect(
      screen.getByText("At least one instruction is required."),
    ).toBeTruthy();
    expect(saveTextOnly).not.toHaveBeenCalled();
    expect(softNavigate).not.toHaveBeenCalled();
  });

  it("does not save a draft without ingredients", async () => {
    const user = userEvent.setup();
    renderEditor({ ...validDraft, ingredients: [] });

    await user.click(screen.getByRole("button", { name: "Save and map" }));

    expect(
      screen.getByText("At least one ingredient is required."),
    ).toBeTruthy();
    expect(saveTextOnly).not.toHaveBeenCalled();
    expect(softNavigate).not.toHaveBeenCalled();
  });

  it("renders instruction steps as matching cards and updates their labels when removed", async () => {
    const user = userEvent.setup();
    renderEditor();

    const ingredientsHeading = screen.getByRole("heading", {
      name: "Ingredients",
      level: 2,
    });
    const instructionsHeading = screen.getByRole("heading", {
      name: "Instructions",
      level: 2,
    });
    expect(instructionsHeading.className).toBe(ingredientsHeading.className);

    const instructions = screen.getByRole("region", { name: "Instructions" });
    const firstStep = screen.getByLabelText("Step 1");
    const firstCard = firstStep.closest("article");
    expect(firstCard?.className).toBe(
      "space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5",
    );

    const stepHeader = firstCard?.firstElementChild;
    const removeFirstStep = within(firstCard as HTMLElement).getByRole("button", {
      name: "Remove step 1",
    });
    expect(stepHeader?.className).toBe("flex items-start justify-between gap-3");
    expect(stepHeader?.firstElementChild?.textContent).toBe("Step 1");
    expect(stepHeader?.lastElementChild).toBe(removeFirstStep);
    expect(instructions.querySelectorAll("article")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Add step" }));
    expect(screen.getByLabelText("Step 3")).toHaveProperty("value", "");

    await user.click(removeFirstStep);
    expect(screen.getByLabelText("Step 1")).toHaveProperty(
      "value",
      "Cook until tender.",
    );
    expect(screen.getByLabelText("Step 2")).toHaveProperty("value", "");
    expect(screen.queryByLabelText("Step 3")).toBeNull();
  });

  it("auto-grows step textareas without a line cap and disables manual resizing", () => {
    renderEditor({ ...validDraft, instructions: [""] });

    const textarea = screen.getByLabelText("Step 1") as HTMLTextAreaElement;
    expect(textarea.className).toContain("resize-none");

    let scrollHeight = 80;
    Object.defineProperty(textarea, "scrollHeight", {
      configurable: true,
      get: () => scrollHeight,
    });
    const getComputedStyle = vi.spyOn(window, "getComputedStyle").mockImplementation(
      () => ({
        lineHeight: "20px",
        paddingTop: "8px",
        paddingBottom: "8px",
        borderTopWidth: "1px",
        borderBottomWidth: "1px",
      }) as CSSStyleDeclaration,
    );

    try {
      fireEvent.change(textarea, { target: { value: "A step\nwith two lines" } });
      expect(textarea.style.height).toBe("82px");
      expect(textarea.style.overflowY).toBe("hidden");

      scrollHeight = 400;
      fireEvent.change(textarea, {
        target: { value: Array.from({ length: 11 }, (_, idx) => `Line ${idx + 1}`).join("\n") },
      });
      expect(textarea.style.height).toBe("402px");
      expect(textarea.style.overflowY).toBe("hidden");
    } finally {
      getComputedStyle.mockRestore();
    }
  });
});
