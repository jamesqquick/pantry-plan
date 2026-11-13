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

  it("prefills an explicit zero price while leaving an unknown price blank", () => {
    expect(ingredientFormValues({ purchasePriceCents: 0 }).purchasePrice).toBe("0");
    expect(ingredientFormValues({ purchasePriceCents: null }).purchasePrice).toBe("");
  });

  it("leaves unknown purchase and volume inputs blank instead of using internal defaults", () => {
    expect(ingredientFormValues({
      name: "Mystery ingredient", costBasisUnit: "G", estimatedCentsPerBasisUnit: 12,
    })).toMatchObject({
      purchasePrice: "", purchaseQuantity: "", purchaseUnit: "",
      volumeAmount: "", volumeUnit: "", volumeWeightGrams: "",
    });
  });

  it("prefills only supplied fields in partial purchase and volume groups", () => {
    expect(ingredientFormValues({
      purchasePriceCents: 400, purchaseQuantity: null, purchaseUnit: null,
      costBasisUnit: "LB", volumeAmount: 0.25, volumeUnit: "CUP",
      volumeWeightGrams: null, gramsPerCup: 120,
    })).toMatchObject({
      purchasePrice: "4", purchaseQuantity: "", purchaseUnit: "",
      volumeAmount: "0.25", volumeUnit: "CUP", volumeWeightGrams: "",
    });
  });

  it("uses a known legacy density without presenting unit cost as a package price", () => {
    expect(ingredientFormValues({ gramsPerCup: 120, estimatedCentsPerBasisUnit: 0.4, costBasisUnit: "LB" })).toMatchObject({
      purchasePrice: "", purchaseQuantity: "", purchaseUnit: "",
      volumeAmount: "1", volumeUnit: "CUP", volumeWeightGrams: "120",
    });
  });
});
