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

  it("identifies intentionally unquantified ingredients without flagging them for review", async () => {
    const user = userEvent.setup();
    renderEditor({ ...validDraft, ingredients: ["Salt to taste"] });

    expect(screen.getByText("No quantity was detected automatically. This line will be saved without an amount.")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByLabelText("Ingredient text for ingredient 1")).toHaveProperty(
      "value",
      "Salt to taste",
    );
    expect(screen.getByLabelText("Quantity for ingredient 1")).toHaveProperty(
      "value",
      "",
    );

    await user.type(screen.getByLabelText("Quantity for ingredient 1"), "1");
    expect(screen.getByText("No quantity was found automatically. Your edits will be saved as entered.")).toBeTruthy();
  });

  it("leaves unresolved lines as original text when the user does not edit them", async () => {
    const user = userEvent.setup();
    renderEditor({ ...validDraft, ingredients: ["1 cup flour (120 g)"] });

    await user.click(screen.getByRole("button", { name: "Save recipe" }));

    await waitFor(() => {
      expect(saveTextOnly).toHaveBeenCalledWith(
        expect.objectContaining({
          ingredients: [
            {
              rawText: "1 cup flour (120 g)",
              displayText: "1 cup flour (120 g)",
              quantity: null,
              unit: null,
            },
          ],
        }),
      );
    });
  });

  it("validates edited quantities before saving", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.clear(screen.getByLabelText("Quantity for ingredient 1"));
    await user.type(screen.getByLabelText("Quantity for ingredient 1"), "1/0");

    await user.click(screen.getByRole("button", { name: "Save recipe" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      'Quantity for "2 cups flour" must be a valid number or fraction that is 0 or greater.',
    );
    expect(saveTextOnly).not.toHaveBeenCalled();
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
