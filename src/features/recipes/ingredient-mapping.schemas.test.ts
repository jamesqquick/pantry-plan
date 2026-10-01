import { describe, expect, it } from "vitest";
import {
  ingredientMappingApplySchema,
  ingredientMappingSelectionSchema,
} from "./ingredient-mapping.schemas";

const baseItem = {
  recipeIngredientId: "row-1",
  recipeIngredientUpdatedAt: 1_700_000_000_000,
  displayText: "olive oil",
  quantity: 2,
  unit: "TBSP" as const,
};

describe("ingredient mapping schemas", () => {
  it.each([
    { kind: "existing", ingredientId: "ingredient-1" },
    { kind: "create", name: "Aleppo pepper" },
    { kind: "unmapped" },
  ])("accepts the $kind mapping state", (mapping) => {
    expect(ingredientMappingSelectionSchema.safeParse(mapping).success).toBe(
      true,
    );
  });

  it("rejects contradictory mapping fields", () => {
    expect(
      ingredientMappingSelectionSchema.safeParse({
        kind: "existing",
        ingredientId: "ingredient-1",
        name: "new ingredient",
      }).success,
    ).toBe(false);
    expect(
      ingredientMappingSelectionSchema.safeParse({
        kind: "unmapped",
        ingredientId: "ingredient-1",
      }).success,
    ).toBe(false);
  });

  it("rejects invalid item values", () => {
    for (const item of [
      { ...baseItem, displayText: "" },
      { ...baseItem, quantity: -1 },
      { ...baseItem, quantity: Number.POSITIVE_INFINITY },
      { ...baseItem, unit: "LITER" },
    ]) {
      expect(
        ingredientMappingApplySchema.safeParse({
          recipeId: "recipe-1",
          items: [{ ...item, mapping: { kind: "unmapped" } }],
        }).success,
      ).toBe(false);
    }
  });

  it("allows nullable or omitted quantity and unit", () => {
    expect(
      ingredientMappingApplySchema.safeParse({
        recipeId: "recipe-1",
        items: [
          {
            recipeIngredientId: "row-1",
            recipeIngredientUpdatedAt: 1_700_000_000_000,
            displayText: "salt",
            mapping: { kind: "unmapped" },
          },
          {
            recipeIngredientId: "row-2",
            recipeIngredientUpdatedAt: 1_700_000_000_000,
            displayText: "pepper",
            quantity: null,
            unit: null,
            mapping: { kind: "create", name: "Black pepper" },
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("shares the 1,000-character ingredient line limit", () => {
    expect(
      ingredientMappingApplySchema.safeParse({
        recipeId: "recipe-1",
        items: [
          {
            ...baseItem,
            displayText: "a".repeat(1_000),
            mapping: { kind: "unmapped" },
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      ingredientMappingApplySchema.safeParse({
        recipeId: "recipe-1",
        items: [
          {
            ...baseItem,
            displayText: "a".repeat(1_001),
            mapping: { kind: "unmapped" },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("caps apply payloads at 200 items", () => {
    const item = {
      ...baseItem,
      mapping: { kind: "unmapped" as const },
    };
    expect(
      ingredientMappingApplySchema.safeParse({
        recipeId: "recipe-1",
        items: Array.from({ length: 200 }, (_, index) => ({
          ...item,
          recipeIngredientId: `row-${index}`,
        })),
      }).success,
    ).toBe(true);
    expect(
      ingredientMappingApplySchema.safeParse({
        recipeId: "recipe-1",
        items: Array.from({ length: 201 }, (_, index) => ({
          ...item,
          recipeIngredientId: `row-${index}`,
        })),
      }).success,
    ).toBe(false);
  });
});
