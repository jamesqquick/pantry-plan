import { describe, expect, it } from "vitest";
import { deriveIngredientPricing } from "./pricing";

describe("deriveIngredientPricing", () => {
  it("derives a package rate without a volume reference", () => {
    expect(deriveIngredientPricing({ purchasePrice: 4, purchaseQuantity: 12, purchaseUnit: "COUNT" })).toMatchObject({
      purchasePriceCents: 400,
      purchaseQuantity: 12,
      purchaseUnit: "COUNT",
      costBasisUnit: "COUNT",
      estimatedCentsPerBasisUnit: 400 / 12,
      volumeAmount: null,
      volumeUnit: null,
      volumeWeightGrams: null,
      gramsPerCup: null,
    });
  });

  it("derives density and item weight without a purchase price", () => {
    expect(deriveIngredientPricing({
      volumeAmount: 0.25,
      volumeUnit: "CUP",
      volumeWeightGrams: 30,
      gramsPerEach: 50,
    })).toMatchObject({
      purchasePriceCents: null,
      purchaseQuantity: null,
      purchaseUnit: null,
      estimatedCentsPerBasisUnit: null,
      gramsPerCup: 120,
      gramsPerEach: 50,
    });
  });

  it("retains incomplete original inputs without deriving a rate or conversion", () => {
    expect(deriveIngredientPricing({ purchasePrice: 4, volumeAmount: 0.25 })).toMatchObject({
      purchasePriceCents: 400,
      purchaseQuantity: null,
      purchaseUnit: null,
      estimatedCentsPerBasisUnit: null,
      volumeAmount: 0.25,
      volumeUnit: null,
      volumeWeightGrams: null,
      gramsPerCup: null,
      costBasisUnit: "G",
    });
  });

  it("leaves absent price and conversion data unknown", () => {
    expect(deriveIngredientPricing({})).toMatchObject({
      purchasePriceCents: null,
      purchaseQuantity: null,
      purchaseUnit: null,
      estimatedCentsPerBasisUnit: null,
      volumeAmount: null,
      volumeUnit: null,
      volumeWeightGrams: null,
      gramsPerCup: null,
      gramsPerEach: null,
    });
  });

  it("preserves a known-zero package rate", () => {
    expect(deriveIngredientPricing({ purchasePrice: 0, purchaseQuantity: 12, purchaseUnit: "COUNT" })).toMatchObject({
      purchasePriceCents: 0,
      estimatedCentsPerBasisUnit: 0,
    });
  });
});
