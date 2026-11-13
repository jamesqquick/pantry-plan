import { describe, expect, it } from "vitest";
import { normalizeIngredientName } from "./normalize";

describe("normalizeIngredientName", () => {
  it.each(["clove", "cloves", "ground clove", "ground cloves", "clove (ground)", "cloves (ground)"])(
    "normalizes spice-clove form %s to clove",
    (name) => expect(normalizeIngredientName(name)).toBe("clove"),
  );

  it("removes clove words from garlic names", () => {
    expect(normalizeIngredientName("garlic clove")).toBe("garlic");
    expect(normalizeIngredientName("garlic cloves")).toBe("garlic");
  });

  it("keeps quantity, punctuation, descriptor, and synonym normalization", () => {
    expect(normalizeIngredientName("2 sea-salt")).toBe("salt");
    expect(normalizeIngredientName("organic unsalted butter")).toBe("butter");
  });
});
