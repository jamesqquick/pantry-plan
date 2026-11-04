import { describe, expect, it } from "vitest";
import { ingredientCreateSchema, ingredientUpdateSchema } from "./ingredients.schemas";

const base = {
  name: "eggs",
  purchasePrice: "4",
  purchaseQuantity: "12",
  purchaseUnit: "COUNT",
  volumeAmount: "1",
  volumeUnit: "CUP",
  volumeWeightGrams: "240",
};

describe("ingredient pricing and measurements", () => {
  it("accepts package pricing and a measured serving size", () => {
    const result = ingredientCreateSchema.parse({
      ...base,
      volumeAmount: "0.25",
      volumeWeightGrams: "30",
      preferredDisplayUnit: "LB",
    });

    expect(result).toMatchObject({
      purchasePrice: 4,
      purchaseQuantity: 12,
      purchaseUnit: "COUNT",
      volumeAmount: 0.25,
      volumeUnit: "CUP",
      volumeWeightGrams: 30,
      preferredDisplayUnit: "LB",
    });
  });

  it.each(["purchasePrice", "purchaseQuantity", "volumeAmount", "volumeWeightGrams"])(
    "requires positive finite %s on create and update",
    (field) => {
      for (const value of [undefined, "", "0", "-1", "not-a-number", "Infinity"]) {
        const values = { ...base, [field]: value };
        expect(ingredientCreateSchema.safeParse(values).success).toBe(false);
        expect(ingredientUpdateSchema.safeParse({ ...values, id: "eggs" }).success).toBe(false);
      }
    },
  );

  it("rejects whitespace-only names", () => {
    expect(ingredientCreateSchema.safeParse({ ...base, name: "  " }).success).toBe(false);
  });

  it("rejects unsupported purchase and volume units", () => {
    expect(ingredientCreateSchema.safeParse({ ...base, purchaseUnit: "PINCH" }).success).toBe(false);
    expect(ingredientCreateSchema.safeParse({ ...base, volumeUnit: "G" }).success).toBe(false);
  });

  it("accepts a positive decimal", () => {
    const result = ingredientCreateSchema.parse({ ...base, gramsPerEach: "50.5" });

    expect(result.gramsPerEach).toBe(50.5);
  });

  it.each([undefined, null, "", "  "])("allows blank item weight: %s", (gramsPerEach) => {
    expect(ingredientCreateSchema.parse({ ...base, gramsPerEach }).gramsPerEach).toBeNull();
  });

  it.each(["0", "-1", "not-a-number", "Infinity"])("rejects item weight %s", (value) => {
    expect(() => ingredientCreateSchema.parse({ ...base, gramsPerEach: value })).toThrow();
  });

  it("rejects inputs whose derived conversion or rate overflows", () => {
    expect(ingredientCreateSchema.safeParse({ ...base, purchaseQuantity: "1e-320" }).success).toBe(false);
    expect(ingredientCreateSchema.safeParse({ ...base, volumeAmount: "1e-320" }).success).toBe(false);
  });
});
