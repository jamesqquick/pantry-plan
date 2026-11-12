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
  it("links to the editor for ingredient mapping without a separate mapping action", async () => {
    const user = userEvent.setup();
    render(<RecipeActions recipeId="recipe-123" />);

    await user.click(screen.getByRole("button", { name: "More recipe actions" }));

    expect(screen.getByRole("menuitem", { name: "Edit" }).getAttribute("href"))
      .toBe("/recipes/recipe-123/edit");
    expect(screen.queryByRole("menuitem", { name: /map ingredients|edit mappings/i })).toBeNull();
  });
});
