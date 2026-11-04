import { describe, expect, it } from "vitest";
import { toDisplayUnits } from "./display-units";

describe("toDisplayUnits count conversions", () => {
  it("uses gramsPerEach for automatic count display", () => {
    const result = toDisplayUnits({
      canonicalQty: 240,
      canonicalUnit: "GRAM",
      ingredient: {
        preferredDisplayUnit: "AUTO",
        gramsPerEach: 120,
      },
    });

    expect(result.displayText).toBe("2 count");
  });

  it("uses gramsPerEach for explicit each display", () => {
    const result = toDisplayUnits({
      canonicalQty: 225,
      canonicalUnit: "GRAM",
      ingredient: {
        preferredDisplayUnit: "EACH",
        gramsPerEach: 120,
      },
    });

    expect(result.displayText).toBe("1 9/10 count");
  });

  it("converts count basis to grams when grams is explicitly preferred", () => {
    const result = toDisplayUnits({
      canonicalQty: 2,
      canonicalUnit: "EACH",
      ingredient: {
        preferredDisplayUnit: "GRAM",
        gramsPerEach: 50,
      },
    });

    expect(result.displayText).toBe("100 g");
  });

  it.each([
    ["KG", 1000, "1 kg"],
    ["LB", 453.59237, "1 lb"],
    ["OZ", 28.3495231, "1 oz"],
  ] as const)("supports %s as an explicit shopping unit", (preferredDisplayUnit, canonicalQty, expected) => {
    expect(toDisplayUnits({ canonicalQty, canonicalUnit: "GRAM", ingredient: { preferredDisplayUnit } }).displayText).toBe(expected);
  });

  it("uses the purchased unit for Auto when no item weight is set", () => {
    expect(toDisplayUnits({
      canonicalQty: 226.796185, canonicalUnit: "GRAM",
      ingredient: { preferredDisplayUnit: "AUTO", purchaseUnit: "LB" },
    }).displayText).toBe("0.5 lb");
  });

  it("uses item weight ahead of the purchase unit for Auto", () => {
    expect(toDisplayUnits({
      canonicalQty: 240, canonicalUnit: "GRAM",
      ingredient: { preferredDisplayUnit: "AUTO", purchaseUnit: "LB", gramsPerEach: 120 },
    }).displayText).toBe("2 count");
  });

  it("falls back to the purchased unit when count display needs an item weight", () => {
    expect(toDisplayUnits({
      canonicalQty: 453.59237, canonicalUnit: "GRAM",
      ingredient: { preferredDisplayUnit: "EACH", purchaseUnit: "LB" },
    }).displayText).toBe("1 lb");
  });

  it("does not require item weight for direct count quantities", () => {
    expect(toDisplayUnits({
      canonicalQty: 2, canonicalUnit: "EACH",
      ingredient: { preferredDisplayUnit: "AUTO", purchaseUnit: "COUNT" },
    }).displayText).toBe("2 count");
  });

  it("keeps legacy cup-per-item conversion available", () => {
    expect(toDisplayUnits({
      canonicalQty: 240, canonicalUnit: "GRAM",
      ingredient: { preferredDisplayUnit: "EACH", gramsPerCup: 120, cupsPerEach: 1 },
    }).displayText).toBe("2 count");
  });

  it.each([["TBSP", "16 tbsp"], ["TSP", "48 tsp"]] as const)("honors legacy %s preferences", (preferredDisplayUnit, expected) => {
    expect(toDisplayUnits({ canonicalQty: 1, canonicalUnit: "CUP", ingredient: { preferredDisplayUnit } }).displayText).toBe(expected);
  });

  it("does not round a small shopping weight down to zero", () => {
    expect(toDisplayUnits({
      canonicalQty: 1, canonicalUnit: "GRAM", ingredient: { preferredDisplayUnit: "KG" },
    }).displayText).toBe("0.001 kg");
  });
});
