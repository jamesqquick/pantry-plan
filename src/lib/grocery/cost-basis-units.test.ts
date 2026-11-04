import { describe, expect, it } from "vitest";
import { costBasisToCanonicalQuantity } from "./cost-basis-units";

describe("costBasisToCanonicalQuantity", () => {
  it("normalizes weight bases to grams", () => {
    expect(costBasisToCanonicalQuantity(2, "LB")).toBeCloseTo(907.18474, 5);
  });

  it("normalizes spoon bases to cups", () => {
    expect(costBasisToCanonicalQuantity(2, "TBSP")).toBe(0.125);
  });
});
