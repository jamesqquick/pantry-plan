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
