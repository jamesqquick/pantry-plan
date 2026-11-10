import { describe, expect, it } from "vitest";
import { buildIngredientDetails } from "./ingredients.details";

describe("buildIngredientDetails", () => {
  it("shows partial purchase and volume inputs without inventing companions", () => {
    const details = Object.fromEntries(buildIngredientDetails({
      purchasePriceCents: 400, purchaseQuantity: null, purchaseUnit: null,
      estimatedCentsPerBasisUnit: null, costBasisUnit: "G",
      volumeAmount: 0.25, volumeUnit: "CUP", volumeWeightGrams: null, gramsPerCup: null,
    }).map(({ label, value }) => [label, value]));

    expect(details["Purchase price"]).toBe("$4.00");
    expect(details["Purchase amount"]).toBe("Not provided");
    expect(details["Volume reference"]).toBe("1/4 cup");
    expect(details["Volume conversion"]).toMatch(/add.*weight/i);
  });

  it("shows complete purchases and legacy rates against their saved basis", () => {
    const complete = Object.fromEntries(buildIngredientDetails({
      purchasePriceCents: 400, purchaseQuantity: 12, purchaseUnit: "COUNT",
      estimatedCentsPerBasisUnit: 400 / 12, costBasisUnit: "COUNT",
    }).map(({ label, value }) => [label, value]));
    const legacy = Object.fromEntries(buildIngredientDetails({
      purchasePriceCents: null, purchaseQuantity: null, purchaseUnit: null,
      estimatedCentsPerBasisUnit: 40, costBasisUnit: "LB", gramsPerCup: 120,
      volumeAmount: null, volumeUnit: null, volumeWeightGrams: null,
    }).map(({ label, value }) => [label, value]));

    expect(complete.Cost).toBe("$4.00 for 12 count");
    expect(legacy["Estimated cost"]).toBe("$0.40 per lb");
    expect(legacy["Volume to weight"]).toBe("1 cup = 120 g");
  });
});
