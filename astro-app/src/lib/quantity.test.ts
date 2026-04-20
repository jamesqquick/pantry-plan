import { describe, it, expect } from "vitest";
import {
  normalizeQuantityInput,
  parseQuantity,
  decimalToNiceFraction,
  toDisplayQuantity,
  scaleQuantity,
  parseQuantityToThreeInts,
  decimalFromWholeNumDen,
  toDisplayQuantityFromInts,
  ALLOWED_FRACTIONS,
} from "./quantity";

describe("normalizeQuantityInput", () => {
  it("converts unicode fractions to ascii", () => {
    expect(normalizeQuantityInput("½")).toBe("1/2");
    expect(normalizeQuantityInput("¼")).toBe("1/4");
    expect(normalizeQuantityInput("¾")).toBe("3/4");
    expect(normalizeQuantityInput("⅓")).toBe("1/3");
    expect(normalizeQuantityInput("⅔")).toBe("2/3");
    expect(normalizeQuantityInput("⅛")).toBe("1/8");
  });

  it("normalizes 1½ to 1 1/2", () => {
    expect(normalizeQuantityInput("1½")).toBe("1 1/2");
  });

  it("trims and collapses spaces", () => {
    expect(normalizeQuantityInput("  1  1/2  ")).toBe("1 1/2");
  });

  it("strips non-quantity characters", () => {
    expect(normalizeQuantityInput("1 1/2 cups")).toBe("1 1/2");
  });
});

describe("parseQuantity", () => {
  it("parses integer", () => {
    expect(parseQuantity("1")).toEqual({ whole: 1, fraction: null, decimal: 1, isValid: true });
    expect(parseQuantity("2")).toEqual({ whole: 2, fraction: null, decimal: 2, isValid: true });
  });

  it("parses fraction only", () => {
    expect(parseQuantity("1/2")).toEqual({
      whole: null,
      fraction: "1/2",
      decimal: 0.5,
      isValid: true,
    });
    expect(parseQuantity("1/3")).toEqual({
      whole: null,
      fraction: "1/3",
      decimal: 0.3333,
      isValid: true,
    });
  });

  it("parses mixed number", () => {
    expect(parseQuantity("1 1/2")).toEqual({
      whole: 1,
      fraction: "1/2",
      decimal: 1.5,
      isValid: true,
    });
    expect(parseQuantity("2 3/4")).toEqual({
      whole: 2,
      fraction: "3/4",
      decimal: 2.75,
      isValid: true,
    });
  });

  it("parses 0 1/2 as whole=0 fraction=1/2", () => {
    const r = parseQuantity("0 1/2");
    expect(r.decimal).toBe(0.5);
    expect(r.fraction).toBe("1/2");
    expect(r.whole).toBe(0);
    expect(r.isValid).toBe(true);
  });

  it("parses unicode and normalizes", () => {
    expect(parseQuantity("½")).toEqual({
      whole: null,
      fraction: "1/2",
      decimal: 0.5,
      isValid: true,
    });
    expect(parseQuantity("1½")).toEqual({
      whole: 1,
      fraction: "1/2",
      decimal: 1.5,
      isValid: true,
    });
  });

  it("parses decimal and converts to nice fraction", () => {
    expect(parseQuantity("1.5")).toEqual({
      whole: 1,
      fraction: "1/2",
      decimal: 1.5,
      isValid: true,
    });
    expect(parseQuantity("0.6667").decimal).toBeCloseTo(0.6667, 3);
    expect(parseQuantity("0.6667").fraction).toBe("2/3");
    expect(parseQuantity("0.6667").isValid).toBe(true);
  });

  it("reduces 1 2/4 to 1 1/2", () => {
    const r = parseQuantity("1 2/4");
    expect(r.decimal).toBe(1.5);
    expect(r.fraction).toBe("1/2");
    expect(r.whole).toBe(1);
    expect(r.isValid).toBe(true);
  });

  it("returns nulls and isValid false for invalid input", () => {
    expect(parseQuantity("")).toEqual({
      whole: null,
      fraction: null,
      decimal: null,
      isValid: false,
    });
    expect(parseQuantity("abc")).toEqual({
      whole: null,
      fraction: null,
      decimal: null,
      isValid: false,
    });
    expect(parseQuantity("-1")).toEqual({
      whole: null,
      fraction: null,
      decimal: null,
      isValid: false,
    });
    expect(parseQuantity("1/0")).toEqual({
      whole: null,
      fraction: null,
      decimal: null,
      isValid: false,
    });
  });
});

describe("decimalToNiceFraction", () => {
  it("converts whole numbers", () => {
    expect(decimalToNiceFraction(2)).toEqual({
      whole: 2,
      fraction: null,
      decimal: 2,
    });
  });

  it("converts 1.3333 to 1 1/3", () => {
    expect(decimalToNiceFraction(1.3333)).toEqual({
      whole: 1,
      fraction: "1/3",
      decimal: 1.3333,
    });
  });

  it("converts 0.6667 to 2/3", () => {
    expect(decimalToNiceFraction(0.6667)).toEqual({
      whole: 0,
      fraction: "2/3",
      decimal: 0.6667,
    });
  });

  it("does not output fraction equal to 1", () => {
    const r = decimalToNiceFraction(1.99);
    expect(r.fraction).toBeNull();
    expect(r.whole).toBe(2);
  });
});

describe("toDisplayQuantity", () => {
  it("returns empty for nulls", () => {
    expect(toDisplayQuantity(null, null)).toBe("");
  });
  it("whole only", () => {
    expect(toDisplayQuantity(2, null)).toBe("2");
  });
  it("fraction only", () => {
    expect(toDisplayQuantity(null, "1/2")).toBe("1/2");
    expect(toDisplayQuantity(0, "1/2")).toBe("1/2");
  });
  it("both", () => {
    expect(toDisplayQuantity(2, "1/2")).toBe("2 1/2");
  });
});

describe("scaleQuantity", () => {
  it("scales and returns nice fraction", () => {
    const r = scaleQuantity(1.5, 2);
    expect(r.decimal).toBe(3);
    expect(r.whole).toBe(3);
    expect(r.fraction).toBeNull();
  });
  it("scales 1/3 by 3 to 1", () => {
    const r = scaleQuantity(1 / 3, 3);
    expect(r.decimal).toBeCloseTo(1, 4);
    expect(r.whole).toBe(1);
    expect(r.fraction).toBeNull();
  });
});

describe("parseQuantityToThreeInts", () => {
  it("parses mixed number", () => {
    expect(parseQuantityToThreeInts("2 1/2")).toEqual({ whole: 2, numerator: 1, denominator: 2 });
  });
  it("parses fraction only", () => {
    expect(parseQuantityToThreeInts("1/3")).toEqual({ whole: 0, numerator: 1, denominator: 3 });
  });
  it("parses integer", () => {
    expect(parseQuantityToThreeInts("3")).toEqual({ whole: 3, numerator: 0, denominator: 0 });
  });
  it("parses decimal to nice fraction", () => {
    const r = parseQuantityToThreeInts("2.25");
    expect(r).not.toBeNull();
    expect(r!.whole).toBe(2);
    expect(r!.numerator).toBe(1);
    expect(r!.denominator).toBe(4);
  });
  it("returns null for invalid input", () => {
    expect(parseQuantityToThreeInts("")).toBeNull();
    expect(parseQuantityToThreeInts("-1")).toBeNull();
    expect(parseQuantityToThreeInts("abc")).toBeNull();
  });
});

describe("decimalFromWholeNumDen", () => {
  it("computes whole + num/den when den > 0", () => {
    expect(decimalFromWholeNumDen(2, 1, 2)).toBe(2.5);
    expect(decimalFromWholeNumDen(0, 1, 2)).toBe(0.5);
  });
  it("treats den 0 or null as no fraction (divide-by-zero safe)", () => {
    expect(decimalFromWholeNumDen(3, 0, 0)).toBe(3);
    expect(decimalFromWholeNumDen(3, null, null)).toBe(3);
    expect(decimalFromWholeNumDen(3, 1, 0)).toBe(3);
  });
});

describe("toDisplayQuantityFromInts", () => {
  it("formats whole + fraction", () => {
    expect(toDisplayQuantityFromInts(2, 1, 2)).toBe("2 1/2");
  });
  it("formats fraction only", () => {
    expect(toDisplayQuantityFromInts(0, 1, 2)).toBe("1/2");
  });
  it("formats whole only when den is 0 or num is 0", () => {
    expect(toDisplayQuantityFromInts(3, 0, 0)).toBe("3");
    expect(toDisplayQuantityFromInts(3, null, null)).toBe("3");
  });
});

describe("ALLOWED_FRACTIONS", () => {
  it("includes empty and common cooking fractions", () => {
    expect(ALLOWED_FRACTIONS[0]).toBe("");
    expect(ALLOWED_FRACTIONS).toContain("1/2");
    expect(ALLOWED_FRACTIONS).toContain("1/3");
    expect(ALLOWED_FRACTIONS).toContain("2/3");
    expect(ALLOWED_FRACTIONS).toContain("1/4");
    expect(ALLOWED_FRACTIONS).toContain("3/4");
  });
});
