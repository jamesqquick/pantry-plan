import { describe, expect, it } from "vitest";
import {
  createRecipeToolSchema,
  importRecipeFromUrlToolSchema,
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
});
