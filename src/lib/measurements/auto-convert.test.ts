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

  it("converts count to weight with gramsPerEach", () => {
    expect(
      autoConvert({
        quantity: 2,
        unit: "COUNT",
        ingredient: { normalizedName: "eggs", gramsPerEach: 50 },
        originalLine: "2 eggs",
      }),
    ).toMatchObject({
      weightGrams: 100,
      conversionSource: "AUTO",
    });
  });

  it("falls back to cupsPerEach for existing count conversion data", () => {
    expect(
      autoConvert({
        quantity: 2,
        unit: "COUNT",
        ingredient: {
          normalizedName: "eggs",
          gramsPerCup: 240,
          cupsPerEach: 0.25,
        },
        originalLine: "2 eggs",
      }),
    ).toMatchObject({
      weightGrams: 120,
      conversionSource: "AUTO",
    });
  });
});
