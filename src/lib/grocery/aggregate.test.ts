import { describe, expect, it } from "vitest";
import { buildGroceryList } from "./aggregate";

describe("buildGroceryList count conversions", () => {
  it.each([
    [Number.MIN_VALUE, 0],
    [0.000000000001, 0],
    [0.49, 0],
    [0.5, 1],
    [1.000001, 1],
    [1.49, 1],
    [1.5, 2],
    [0, 0],
  ])("rounds a %s-cent estimate to the nearest cent: %s cents", (rate, expected) => {
    const result = buildGroceryList({
      orderItems: [{ recipeId: "recipe-1", batches: 1 }],
      recipes: [{ id: "recipe-1", title: "Measured ingredient", ingredients: [{
        id: "line-1", ingredientId: "ingredient", quantity: 1, unit: "G", displayText: "1 g",
        ingredient: { id: "ingredient", name: "Ingredient", costBasisUnit: "G", estimatedCentsPerBasisUnit: rate },
      }] }],
    });

    expect(result.totals[0]?.estimatedCostCents).toBe(expected);
    expect(result.totalEstimatedCostCents).toBe(expected);
    expect(result.issues.missingCost).toEqual([]);
  });

  it("rounds after aggregating sources for the same ingredient", () => {
    const result = buildGroceryList({
      orderItems: [{ recipeId: "recipe-1", batches: 1 }],
      recipes: [{ id: "recipe-1", title: "Measured ingredient", ingredients: Array.from({ length: 2 }, (_, index) => ({
        id: `line-${index}`, ingredientId: "ingredient", quantity: 1, unit: "G", displayText: "1 g",
        ingredient: { id: "ingredient", name: "Ingredient", costBasisUnit: "G", estimatedCentsPerBasisUnit: 0.49 },
      })) }],
    });

    expect(result.totals).toHaveLength(1);
    expect(result.totals[0]).toMatchObject({
      ingredientId: "ingredient", totalBasisQty: 2, estimatedCostCents: 1,
    });
    expect(result.totals[0]?.sources).toHaveLength(2);
    expect(result.totalEstimatedCostCents).toBe(1);
  });

  it("sums rounded ingredient costs instead of rounding the grand total", () => {
    const result = buildGroceryList({
      orderItems: [{ recipeId: "recipe-1", batches: 1 }],
      recipes: [{ id: "recipe-1", title: "Measured ingredients", ingredients: [{
        id: "line-1", ingredientId: "ingredient-1", quantity: 1, unit: "G", displayText: "1 g",
        ingredient: { id: "ingredient-1", name: "Ingredient 1", costBasisUnit: "G", estimatedCentsPerBasisUnit: 0.49 },
      }, {
        id: "line-2", ingredientId: "ingredient-2", quantity: 1, unit: "G", displayText: "1 g",
        ingredient: { id: "ingredient-2", name: "Ingredient 2", costBasisUnit: "G", estimatedCentsPerBasisUnit: 0.49 },
      }] }],
    });

    expect(result.totals).toHaveLength(2);
    expect(result.totals).toMatchObject([
      { ingredientId: "ingredient-1", estimatedCostCents: 0 },
      { ingredientId: "ingredient-2", estimatedCostCents: 0 },
    ]);
    expect(result.totalEstimatedCostCents).toBe(0);
    expect(result.issues.missingCost).toEqual([]);
  });

  it.each([0, null])("distinguishes zero from missing water costs when the rate is %s", (rate) => {
    const result = buildGroceryList({
      orderItems: [{ recipeId: "churros", batches: 2 }],
      recipes: [{ id: "churros", title: "Churros", ingredients: [{
        id: "water-line", ingredientId: "water", quantity: 0.5, unit: "CUP", displayText: "water",
        ingredient: { id: "water", name: "Water", costBasisUnit: "CUP", estimatedCentsPerBasisUnit: rate },
      }] }],
    });

    expect(result.totals).toHaveLength(1);
    expect(result.totals[0]).toMatchObject({
      ingredientId: "water", totalBasisQty: 1, estimatedCostCents: rate,
    });
    expect(result.totals[0]?.sources).toMatchObject([{
      recipeIngredientId: "water-line", recipeId: "churros", recipeTitle: "Churros", displayText: "water",
      qty: 0.5, unit: "CUP", batches: 2, basisQty: 1,
    }]);
    expect(result.issues.missingCost).toMatchObject(rate === 0 ? [] : [{
      groupKey: "water:CUP", ingredientId: "water", name: "Water", reason: "missing-price",
    }]);
    expect(result.issues.cannotConvert).toEqual([]);
    expect(result.totalEstimatedCostCents).toBe(rate === 0 ? 0 : null);
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

  it("keeps a scaled count quantity when price and weight conversion are unknown", () => {
    const result = buildGroceryList({
      orderItems: [{ recipeId: "eggs", batches: 2 }],
      recipes: [{ id: "eggs", title: "Eggs", ingredients: [{
        id: "eggs-line", ingredientId: "eggs", quantity: 2, unit: "COUNT", displayText: "2 eggs",
        ingredient: { id: "eggs", name: "Eggs", costBasisUnit: "G", estimatedCentsPerBasisUnit: null },
      }] }],
    });

    expect(result.totals).toMatchObject([{
      groupKey: "eggs:COUNT", basisUnit: "COUNT", totalBasisQty: 4, estimatedCostCents: null,
      sources: [{ recipeId: "eggs", recipeTitle: "Eggs", qty: 2, unit: "COUNT", batches: 2, basisQty: 4 }],
    }]);
    expect(result.totalEstimatedCostCents).toBeNull();
    expect(result.issues.cannotConvert).toEqual([]);
  });

  it("combines cups and tablespoons without density", () => {
    const result = buildGroceryList({
      orderItems: [{ recipeId: "soup", batches: 2 }],
      recipes: [{ id: "soup", title: "Soup", ingredients: [
        { id: "cup", ingredientId: "salt", quantity: 1, unit: "CUP", displayText: "1 cup salt", ingredient: { id: "salt", name: "Salt", costBasisUnit: "G", estimatedCentsPerBasisUnit: null } },
        { id: "spoons", ingredientId: "salt", quantity: 2, unit: "TBSP", displayText: "2 tbsp salt", ingredient: { id: "salt", name: "Salt", costBasisUnit: "G", estimatedCentsPerBasisUnit: null } },
      ] }],
    });

    expect(result.totals).toHaveLength(1);
    expect(result.totals[0]).toMatchObject({ groupKey: "salt:CUP", basisUnit: "CUP", totalBasisQty: 2.25, estimatedCostCents: null });
  });

  describe.each([
    { costBasisUnit: "COUNT", gramsPerCup: 120, gramsPerEach: null, cupsPerEach: null, units: ["G", "CUP"], amounts: [120, 1], basisUnit: "G", totalBasisQty: 240 },
    { costBasisUnit: "CUP", gramsPerCup: null, gramsPerEach: 50, cupsPerEach: null, units: ["COUNT", "G"], amounts: [1, 50], basisUnit: "G", totalBasisQty: 100 },
    { costBasisUnit: "G", gramsPerCup: null, gramsPerEach: null, cupsPerEach: 0.5, units: ["COUNT", "CUP"], amounts: [1, 0.5], basisUnit: "CUP", totalBasisQty: 1 },
  ] as const)("quantity bridges with an unrelated $costBasisUnit cost basis", (fixture) => {
    it.each([null, 100])("combines compatible quantities when the saved rate is %s", (rate) => {
      const lines = fixture.units.map((unit, index) => ({
        id: `line-${index}`, ingredientId: "ingredient", quantity: fixture.amounts[index]!, unit,
        displayText: `${fixture.amounts[index]} ${unit}`,
        ingredient: {
          id: "ingredient", name: "Ingredient", costBasisUnit: fixture.costBasisUnit,
          estimatedCentsPerBasisUnit: rate,
          gramsPerCup: fixture.gramsPerCup, gramsPerEach: fixture.gramsPerEach, cupsPerEach: fixture.cupsPerEach,
        },
      }));

      for (const ingredients of [lines, [...lines].reverse()]) {
        const result = buildGroceryList({
          orderItems: [{ recipeId: "recipe", batches: 2 }],
          recipes: [{ id: "recipe", title: "Recipe", ingredients }],
        });

        expect(result.totals).toHaveLength(1);
        expect(result.totals[0]).toMatchObject({
          groupKey: `ingredient:${fixture.basisUnit}`, basisUnit: fixture.basisUnit,
          totalBasisQty: fixture.totalBasisQty * 2, estimatedCostCents: null,
        });
        expect(result.totals[0]?.sources).toHaveLength(2);
        expect(result.totals[0]?.sources).toEqual(expect.arrayContaining(lines.map((line) => expect.objectContaining({
          recipeIngredientId: line.id, recipeId: "recipe", recipeTitle: "Recipe", displayText: line.displayText,
          qty: line.quantity, unit: line.unit, batches: 2,
        }))));
        expect(result.issues.cannotConvert.filter(({ kind }) => kind === "cannot-combine")).toEqual([]);
        expect(result.issues.missingCost).toMatchObject([{ reason: rate == null ? "missing-price" : "missing-conversion" }]);
        expect(result.totalEstimatedCostCents).toBeNull();
      }
    });
  });

  it.each(["G", "CUP"] as const)("uses count as the common group for item-weight and item-volume bridges with %s pricing", (costBasisUnit) => {
    const result = buildGroceryList({
      orderItems: [{ recipeId: "recipe", batches: 1 }],
      recipes: [{ id: "recipe", title: "Recipe", ingredients: [
        { id: "count", quantity: 1, unit: "COUNT" as const },
        { id: "weight", quantity: 50, unit: "G" as const },
        { id: "volume", quantity: 0.5, unit: "CUP" as const },
      ].map((line) => ({
        ...line, ingredientId: "ingredient", displayText: `${line.quantity} ${line.unit}`,
        ingredient: { id: "ingredient", name: "Ingredient", costBasisUnit, estimatedCentsPerBasisUnit: 100, gramsPerEach: 50, cupsPerEach: 0.5 },
      })) }],
    });

    expect(result.totals).toHaveLength(1);
    expect(result.totals[0]).toMatchObject({ basisUnit: "COUNT", totalBasisQty: 3, estimatedCostCents: costBasisUnit === "G" ? 15000 : 150 });
    expect(result.totals[0]?.sources).toHaveLength(3);
    expect(result.issues.cannotConvert).toEqual([]);
    expect(result.issues.missingCost).toEqual([]);
  });

  it("retains and explains incompatible count and mass groups", () => {
    const result = buildGroceryList({
      orderItems: [{ recipeId: "soup", batches: 1 }],
      recipes: [{ id: "soup", title: "Soup", ingredients: [
        { id: "count", ingredientId: "onion", quantity: 2, unit: "COUNT" as const, displayText: "2 onions" },
        { id: "weight", ingredientId: "onion", quantity: 200, unit: "G" as const, displayText: "200 g onion" },
      ].map((line) => ({ ...line, ingredient: { id: "onion", name: "Onion", costBasisUnit: "G" as const, estimatedCentsPerBasisUnit: null } })) }],
    });

    expect(result.totals.map((row) => [row.basisUnit, row.totalBasisQty])).toEqual(expect.arrayContaining([["COUNT", 2], ["G", 200]]));
    expect(new Set(result.totals.map((row) => row.groupKey)).size).toBe(2);
    expect(result.issues.cannotConvert.some((issue) => issue.kind === "cannot-combine" && /kept separate/i.test(issue.reason))).toBe(true);
  });

  it("keeps a count row visible when a weight-priced ingredient lacks item weight", () => {
    const result = buildGroceryList({
      orderItems: [{ recipeId: "soup", batches: 1 }],
      recipes: [{ id: "soup", title: "Soup", ingredients: [{
        id: "onion", ingredientId: "onion", quantity: 2, unit: "COUNT", displayText: "2 onions",
        ingredient: {
          id: "onion", name: "Onion", costBasisUnit: "LB", estimatedCentsPerBasisUnit: 250,
          purchasePriceCents: 250, purchaseQuantity: 1, purchaseUnit: "LB",
        },
      }] }],
    });

    expect(result.totals).toMatchObject([{ groupKey: "onion:COUNT", basisUnit: "COUNT", totalBasisQty: 2, estimatedCostCents: null }]);
    expect(result.issues.missingCost).toMatchObject([{ groupKey: "onion:COUNT", ingredientId: "onion", reason: "missing-conversion" }]);
    expect(result.issues.cannotConvert.some((issue) => issue.kind === "missing-conversion" && /item weight/i.test(issue.reason))).toBe(true);
    expect(result.totalEstimatedCostCents).toBeNull();
  });

  it("keeps unresolved recipe lines with their original text and batch context", () => {
    const result = buildGroceryList({
      orderItems: [{ recipeId: "soup", batches: 2 }],
      recipes: [{ id: "soup", title: "Soup", ingredients: [
        { id: "unmapped", ingredientId: null, quantity: 1, unit: "TSP", displayText: "salt to taste" },
        { id: "missing", ingredientId: "salt", ingredient: { id: "salt", name: "Salt", costBasisUnit: "G", estimatedCentsPerBasisUnit: null }, quantity: null, unit: null, displayText: "salt to taste" },
      ] }],
    });

    expect(result.issues.unmapped).toMatchObject([{ recipeId: "soup", recipeTitle: "Soup", displayText: "salt to taste", quantity: 1, unit: "TSP", batches: 2 }]);
    expect(result.issues.missingQuantityOrUnit).toMatchObject([{ recipeId: "soup", recipeTitle: "Soup", displayText: "salt to taste", quantity: null, unit: null, batches: 2 }]);
  });

  it("prices a saved legacy rate against its original basis without package details", () => {
    const result = buildGroceryList({
      orderItems: [{ recipeId: "soup", batches: 1 }],
      recipes: [{ id: "soup", title: "Soup", ingredients: [{
        id: "flour", ingredientId: "flour", quantity: 1, unit: "LB", displayText: "1 lb flour",
        ingredient: {
          id: "flour", name: "Flour", costBasisUnit: "LB", estimatedCentsPerBasisUnit: 40,
          purchasePriceCents: null, purchaseQuantity: null, purchaseUnit: null,
        },
      }] }],
    });

    expect(result.totals).toMatchObject([{ groupKey: "flour:G", basisUnit: "G", estimatedCostCents: 40 }]);
    expect(result.issues.missingCost).toEqual([]);
    expect(result.totalEstimatedCostCents).toBe(40);
  });
});
