import { describe, expect, it } from "vitest";
import {
  createRecipeToolSchema,
  createWeeklyMealPlanToolSchema,
  importRecipeFromUrlToolSchema,
  searchRecipesToolSchema,
} from "./mcp.schemas";

describe("MCP tool schemas", () => {
  it("accepts a complete structured recipe", () => {
    expect(
      createRecipeToolSchema.safeParse({
        title: "Tomato Soup",
        ingredients: ["2 cans tomatoes"],
        instructions: ["Simmer for 20 minutes"],
      }).success,
    ).toBe(true);
  });

  it("requires ingredients and instructions", () => {
    expect(
      createRecipeToolSchema.safeParse({
        title: "Incomplete",
        ingredients: [],
        instructions: [],
      }).success,
    ).toBe(false);
  });

  it("caps recipe URL input size", () => {
    expect(importRecipeFromUrlToolSchema.safeParse({ url: "https://example.com/recipe" }).success).toBe(true);
    expect(importRecipeFromUrlToolSchema.safeParse({ url: "x".repeat(2_049) }).success).toBe(false);
  });

  it("defaults and bounds recipe search limits", () => {
    expect(searchRecipesToolSchema.parse({ query: "soup" }).limit).toBe(10);
    expect(searchRecipesToolSchema.safeParse({ query: "soup", limit: 25 }).success).toBe(true);
    expect(searchRecipesToolSchema.safeParse({ query: "soup", limit: 26 }).success).toBe(false);
    expect(searchRecipesToolSchema.safeParse({ query: "   " }).success).toBe(false);
  });

  it("accepts a partial weekly plan with saved recipe ids", () => {
    expect(
      createWeeklyMealPlanToolSchema.safeParse({
        weekStart: "2026-08-30",
        meals: [
          {
            date: "2026-09-01",
            mealSlot: "DINNER",
            recipeId: "recipe-1",
            servings: 4,
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("allows an empty plan and rejects custom labels", () => {
    expect(
      createWeeklyMealPlanToolSchema.safeParse({
        weekStart: "2026-08-30",
        meals: [],
      }).success,
    ).toBe(true);
    expect(
      createWeeklyMealPlanToolSchema.safeParse({
        weekStart: "2026-08-30",
        meals: [{ date: "2026-08-30", mealSlot: "LUNCH", customLabel: "Leftovers" }],
      }).success,
    ).toBe(false);
    expect(
      createWeeklyMealPlanToolSchema.safeParse({
        weekStart: "2026-08-30",
        meals: [
          {
            date: "2026-08-30",
            mealSlot: "LUNCH",
            recipeId: "recipe-1",
            customLabel: "Leftovers",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      createWeeklyMealPlanToolSchema.safeParse({
        weekStart: "2026-02-30",
        meals: [],
      }).success,
    ).toBe(false);
  });
});
