import { describe, it, expect } from "vitest";
import { formatIngredientLine } from "./ingredientLineFormat";

describe("formatIngredientLine", () => {
  it("formats quantity + unit + name as fraction", () => {
    expect(
      formatIngredientLine({
        quantity: 1.5,
        unit: "cup",
        nameNormalized: "flour",
      })
    ).toBe("1 1/2 cups flour");
  });

  it("formats fraction only + unit + name", () => {
    expect(
      formatIngredientLine({
        quantity: 0.5,
        unit: "tsp",
        nameNormalized: "salt",
      })
    ).toBe("1/2 tsp salt");
  });

  it("returns Unparsed ingredient when no name", () => {
    expect(
      formatIngredientLine({
        quantity: 1,
        unit: "cup",
        nameNormalized: null,
        ingredientName: null,
      })
    ).toBe("Unparsed ingredient");
  });

  it("uses ingredientName when nameNormalized is empty", () => {
    expect(
      formatIngredientLine({
        quantity: 2,
        unit: "count",
        nameNormalized: null,
        ingredientName: "Eggs (large)",
      })
    ).toBe("2 count Eggs (large)");
  });

  it("skips missing parts gracefully", () => {
    expect(
      formatIngredientLine({
        quantity: null,
        unit: null,
        nameNormalized: "sugar",
      })
    ).toBe("sugar");
  });

  it("formats decimal quantity as fraction", () => {
    expect(
      formatIngredientLine({
        quantity: 1.5,
        unit: "cup",
        nameNormalized: "milk",
      })
    ).toBe("1 1/2 cups milk");
    expect(
      formatIngredientLine({
        quantity: 2,
        unit: null,
        nameNormalized: "eggs",
      })
    ).toBe("2 eggs");
  });
});
