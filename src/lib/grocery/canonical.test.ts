import { describe, expect, it } from "vitest";
import { convertToBasis, lineVolumeToCups } from "./canonical";

describe("lineVolumeToCups", () => {
  it("includes PINCH on recipe lines", () => {
    const c = lineVolumeToCups(16 * 48, "PINCH");
    expect(c).not.toBeNull();
    expect(c!).toBeCloseTo(1, 5);
  });
});

describe("convertToBasis", () => {
  it("G basis: mass line", () => {
    const r = convertToBasis({
      quantity: 2,
      unit: "KG",
      basisUnit: "G",
      ingredientConversion: null,
    });
    expect(r?.basisQty).toBeCloseTo(2000, 5);
    expect(r?.basisUnitLabel).toBe("g");
  });

  it("TSP basis: line in cups", () => {
    const r = convertToBasis({
      quantity: 1,
      unit: "CUP",
      basisUnit: "TSP",
      ingredientConversion: null,
    });
    expect(r?.basisQty).toBeCloseTo(48, 5);
    expect(r?.basisUnitLabel).toBe("tsp");
  });

  it("CUP basis: line PINCH aggregates to cups", () => {
    const r = convertToBasis({
      quantity: 16 * 48,
      unit: "PINCH",
      basisUnit: "CUP",
      ingredientConversion: null,
    });
    expect(r?.basisQty).toBeCloseTo(1, 5);
  });

  it("G basis: volume line with gramsPerCup", () => {
    const r = convertToBasis({
      quantity: 1,
      unit: "CUP",
      basisUnit: "G",
      ingredientConversion: { gramsPerCup: 240 },
    });
    expect(r?.basisQty).toBe(240);
  });

  it("G basis: COUNT line with gramsPerEach", () => {
    const r = convertToBasis({
      quantity: 2,
      unit: "COUNT",
      basisUnit: "G",
      ingredientConversion: { gramsPerEach: 120 },
    });
    expect(r?.basisQty).toBe(240);
    expect(r?.basisUnitLabel).toBe("g");
  });

  it("COUNT basis: mass line with gramsPerEach", () => {
    const r = convertToBasis({
      quantity: 240,
      unit: "G",
      basisUnit: "COUNT",
      ingredientConversion: { gramsPerEach: 120 },
    });
    expect(r?.basisQty).toBe(2);
    expect(r?.basisUnitLabel).toBe("ea");
  });

  it("COUNT basis: volume line can use gramsPerCup and gramsPerEach", () => {
    const r = convertToBasis({
      quantity: 0.5,
      unit: "CUP",
      basisUnit: "COUNT",
      ingredientConversion: { gramsPerCup: 160, gramsPerEach: 120 },
    });
    expect(r?.basisQty).toBeCloseTo(2 / 3, 5);
  });

  it("COUNT basis: weight line keeps using cupsPerEach as a legacy fallback", () => {
    const r = convertToBasis({
      quantity: 240,
      unit: "G",
      basisUnit: "COUNT",
      ingredientConversion: { gramsPerCup: 240, cupsPerEach: 1 },
    });
    expect(r?.basisQty).toBe(1);
  });

  it("uses an explicitly measured item weight ahead of legacy cupsPerEach", () => {
    const ingredientConversion = { gramsPerCup: 100, gramsPerEach: 50, cupsPerEach: 1 };
    expect(convertToBasis({ quantity: 100, unit: "G", basisUnit: "COUNT", ingredientConversion })?.basisQty).toBe(2);
    expect(convertToBasis({ quantity: 1, unit: "COUNT", basisUnit: "CUP", ingredientConversion })?.basisQty).toBe(0.5);
  });

  it("COUNT basis: COUNT line", () => {
    const r = convertToBasis({
      quantity: 3,
      unit: "COUNT",
      basisUnit: "COUNT",
      ingredientConversion: null,
    });
    expect(r?.basisQty).toBe(3);
  });
});
