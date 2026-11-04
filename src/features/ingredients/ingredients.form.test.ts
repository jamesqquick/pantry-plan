import { describe, expect, it } from "vitest";
import { ingredientFormValues } from "./ingredients.form";

describe("ingredient form preloading", () => {
  it("reopens the original package and quarter-cup serving", () => {
    expect(ingredientFormValues({
      purchasePriceCents: 799, purchaseQuantity: 2000, purchaseUnit: "G",
      volumeAmount: 0.25, volumeUnit: "CUP", volumeWeightGrams: 30, gramsPerCup: 120,
      preferredDisplayUnit: "LB", gramsPerEach: null,
    })).toMatchObject({
      purchasePrice: "7.99", purchaseQuantity: "2000", purchaseUnit: "G",
      volumeAmount: "0.25", volumeUnit: "CUP", volumeWeightGrams: "30",
      preferredDisplayUnit: "LB", gramsPerEach: "",
    });
  });

  it("uses a known legacy density without presenting unit cost as a package price", () => {
    expect(ingredientFormValues({ gramsPerCup: 120, estimatedCentsPerBasisUnit: 0.4, costBasisUnit: "LB" })).toMatchObject({
      purchasePrice: "", purchaseQuantity: "", purchaseUnit: "LB",
      volumeAmount: "1", volumeUnit: "CUP", volumeWeightGrams: "120",
    });
  });
});
