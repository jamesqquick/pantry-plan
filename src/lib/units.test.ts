import { describe, it, expect } from "vitest";
import { normalizeUnit, formatUnitForDisplay } from "./units";

describe("normalizeUnit", () => {
  it("maps cups to cup", () => {
    expect(normalizeUnit("cups")).toBe("cup");
    expect(normalizeUnit("cup")).toBe("cup");
  });
  it("maps tablespoons to tbsp", () => {
    expect(normalizeUnit("tablespoons")).toBe("tbsp");
    expect(normalizeUnit("tablespoon")).toBe("tbsp");
    expect(normalizeUnit("tbsp")).toBe("tbsp");
  });
  it("maps teaspoon to tsp", () => {
    expect(normalizeUnit("teaspoon")).toBe("tsp");
    expect(normalizeUnit("teaspoons")).toBe("tsp");
    expect(normalizeUnit("tsp")).toBe("tsp");
  });
  it("maps grams to g", () => {
    expect(normalizeUnit("grams")).toBe("g");
    expect(normalizeUnit("g")).toBe("g");
  });
  it("maps ounces to oz", () => {
    expect(normalizeUnit("ounces")).toBe("oz");
    expect(normalizeUnit("oz")).toBe("oz");
  });
  it("returns null for empty or unknown", () => {
    expect(normalizeUnit("")).toBeNull();
    expect(normalizeUnit("  ")).toBeNull();
    expect(normalizeUnit("unknown")).toBeNull();
  });
});

describe("formatUnitForDisplay", () => {
  it("returns empty for null unit", () => {
    expect(formatUnitForDisplay(null, 1)).toBe("");
  });
  it("pluralizes cup when quantity !== 1", () => {
    expect(formatUnitForDisplay("cup", 1)).toBe("cup");
    expect(formatUnitForDisplay("cup", 2)).toBe("cups");
    expect(formatUnitForDisplay("cup", 0.5)).toBe("cups");
  });
  it("keeps tbsp/tsp unchanged", () => {
    expect(formatUnitForDisplay("tbsp", 1)).toBe("tbsp");
    expect(formatUnitForDisplay("tbsp", 2)).toBe("tbsp");
    expect(formatUnitForDisplay("tsp", 2)).toBe("tsp");
  });
});
