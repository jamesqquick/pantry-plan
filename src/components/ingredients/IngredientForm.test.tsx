// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import IngredientForm from "./IngredientForm";

const { create, update, searchGlobalForBase, getGlobalBasePrefill } = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  searchGlobalForBase: vi.fn(),
  getGlobalBasePrefill: vi.fn(),
}));

vi.mock("astro:actions", () => ({
  actions: {
    ingredients: { create, update, searchGlobalForBase, getGlobalBasePrefill },
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("IngredientForm actions", () => {
  it.each([
    ["create", "Create ingredient", "/ingredients"],
    ["edit", "Save changes", "/ingredients/ingredient-123"],
  ] as const)("keeps %s actions in the mobile dock", (mode, saveLabel, cancelHref) => {
    render(
      mode === "create" ? (
        <IngredientForm mode="create" categories={[]} />
      ) : (
        <IngredientForm
          mode="edit"
          ingredientId="ingredient-123"
          categories={[]}
          initialValues={{
            name: "Flour",
            category: "",
            defaultUnit: "",
            costBasisUnit: "G",
            estimatedCost: "",
            notes: "",
            preferredDisplayUnit: "AUTO",
            baseIngredientId: "",
          }}
        />
      ),
    );

    const actions = screen.getByRole("group", { name: "Form actions" });
    const dock = actions.parentElement;
    expect(dock?.className).toContain("fixed");
    expect(dock?.className).toContain("sm:static");
    expect(actions.className).toContain("flex-row-reverse");
    expect(within(actions).getByRole("button", { name: saveLabel }).className).toContain("min-h-12");
    expect(within(actions).getByRole("link", { name: "Cancel" }).getAttribute("href")).toBe(cancelHref);
  });
});
