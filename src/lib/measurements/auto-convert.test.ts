import { describe, expect, it } from "vitest";
import { autoConvert } from "./auto-convert";

describe("autoConvert", () => {
  it("preserves zero for weight conversions", () => {
    expect(
      autoConvert({
        quantity: 0,
        unit: "KG",
        ingredient: { normalizedName: "flour", gramsPerCup: 120 },
        originalLine: "0 kg flour",
      }),
    ).toMatchObject({
      weightGrams: 0,
      conversionSource: "AUTO",
      conversionConfidence: "HIGH",
    });
  });

  it("preserves zero for volume conversions", () => {
    expect(
      autoConvert({
        quantity: 0,
        unit: "CUP",
        ingredient: { normalizedName: "flour", gramsPerCup: 120 },
        originalLine: "0 cups flour",
      }),
    ).toMatchObject({
      weightGrams: 0,
      conversionSource: "AUTO",
      conversionConfidence: "HIGH",
    });
  });
});
