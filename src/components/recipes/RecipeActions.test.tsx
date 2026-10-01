// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import RecipeActions from "./RecipeActions";

vi.mock("astro:actions", () => ({
  actions: {
    recipes: {
      delete: vi.fn(),
      duplicate: vi.fn(),
    },
  },
}));

afterEach(cleanup);

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
});
