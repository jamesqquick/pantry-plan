import { describe, expect, it } from "vitest";
import { buildGroceryList } from "./aggregate";

describe("buildGroceryList count conversions", () => {
  it.each([
    [Number.MIN_VALUE, 1],
    [0.000000000001, 1],
    [1.000001, 2],
    [1.5, 2],
    [0, 0],
  ])("rounds a real %s-cent cost up to %s cents", (rate, expected) => {
    const result = buildGroceryList({
      orderItems: [{ recipeId: "recipe-1", batches: 1 }],
      recipes: [{ id: "recipe-1", title: "Measured ingredient", ingredients: [{
        id: "line-1", ingredientId: "ingredient", quantity: 1, unit: "G", displayText: "1 g",
        ingredient: { id: "ingredient", name: "Ingredient", costBasisUnit: "G", estimatedCentsPerBasisUnit: rate },
      }] }],
    });

    expect(result.totalEstimatedCostCents).toBe(expected);
  });

  it("does not charge an extra cent for floating-point noise from summed quantities", () => {
    const result = buildGroceryList({
      orderItems: [{ recipeId: "recipe-1", batches: 1 }],
      recipes: [{ id: "recipe-1", title: "Portioned ingredient", ingredients: Array.from({ length: 30 }, (_, index) => ({
        id: `line-${index}`, ingredientId: "ingredient", quantity: 0.1, unit: "COUNT", displayText: "0.1 item",
        ingredient: { id: "ingredient", name: "Ingredient", costBasisUnit: "COUNT", estimatedCentsPerBasisUnit: 150 },
      })) }],
    });

    expect(result.totalEstimatedCostCents).toBe(450);
  });

  it("prices counted recipe lines against a weight basis", () => {
    const result = buildGroceryList({
      orderItems: [{ recipeId: "recipe-1", batches: 1 }],
      recipes: [{
        id: "recipe-1",
        title: "Eggs",
        ingredients: [{
          id: "line-1",
          ingredientId: "egg",
          ingredient: {
            id: "egg",
            name: "Egg",
            costBasisUnit: "G",
            estimatedCentsPerBasisUnit: 2,
            gramsPerCup: null,
            gramsPerEach: 50,
            cupsPerEach: null,
            preferredDisplayUnit: "AUTO",
          },
          quantity: 2,
          unit: "COUNT",
          displayText: "2 eggs",
        }],
      }],
    });

    expect(result.totals).toHaveLength(1);
    expect(result.totals[0]?.totalBasisQty).toBe(100);
    expect(result.totals[0]?.estimatedCostCents).toBe(200);
    expect(result.issues.cannotConvert).toHaveLength(0);
  });

  it("converts a weight recipe line to a count price", () => {
    const result = buildGroceryList({
      orderItems: [{ recipeId: "recipe-1", batches: 1 }],
      recipes: [{
        id: "recipe-1",
        title: "Onion soup",
        ingredients: [{
          id: "line-1",
          ingredientId: "onion",
          ingredient: {
            id: "onion",
            name: "Onion",
            costBasisUnit: "COUNT",
            estimatedCentsPerBasisUnit: 30,
            gramsPerCup: null,
            gramsPerEach: 120,
            cupsPerEach: null,
            preferredDisplayUnit: "AUTO",
          },
          quantity: 240,
          unit: "G",
          displayText: "240 g onion",
        }],
      }],
    });

    expect(result.totals[0]?.totalBasisQty).toBe(2);
    expect(result.totals[0]?.estimatedCostCents).toBe(60);
    expect(result.issues.cannotConvert).toHaveLength(0);
  });
});
