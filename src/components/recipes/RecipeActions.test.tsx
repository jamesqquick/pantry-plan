// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import RecipeActions from "./RecipeActions";

const { duplicate, deleteRecipe } = vi.hoisted(() => ({
  duplicate: vi.fn(),
  deleteRecipe: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    recipes: {
      delete: deleteRecipe,
      duplicate,
    },
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("RecipeActions", () => {
  it.each([
    [true, "Map ingredients"],
    [false, "Edit mappings"],
  ])("links to mapping review when hasUnmappedIngredients is %s", async (hasUnmappedIngredients, label) => {
    const user = userEvent.setup();
    render(
      <RecipeActions
        recipeId="recipe-123"
        hasUnmappedIngredients={hasUnmappedIngredients}
      />,
    );

    await user.click(screen.getByRole("button", { name: "More recipe actions" }));

    expect(
      screen.getByRole("menuitem", { name: label }).getAttribute("href"),
    ).toBe("/recipes/recipe-123/map-ingredients");
  });

  it("duplicates the selected recipe and displays an action error", async () => {
    duplicate.mockResolvedValue({ data: undefined, error: { message: "Could not duplicate recipe" } });
    const user = userEvent.setup();
    render(<RecipeActions recipeId="recipe-123" />);

    await user.click(screen.getByRole("button", { name: "More recipe actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Duplicate" }));

    expect(duplicate).toHaveBeenCalledOnce();
    expect(duplicate.mock.calls[0][0].get("recipeId")).toBe("recipe-123");
    expect((await screen.findByRole("alert")).textContent).toBe("Could not duplicate recipe");
  });
});
