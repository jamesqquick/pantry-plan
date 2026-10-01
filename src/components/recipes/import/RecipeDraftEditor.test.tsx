// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
        expect.objectContaining({ ingredients: ["2 cups flour", "3 eggs"] }),
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
        expect.objectContaining({ ingredients: ["2 cups flour", "3 eggs"] }),
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
});
