import { describe, it, expect } from "vitest";
import {
  parseIngredientLineStructured,
  mergeParsedIntoStructured,
  type ParsedIngredientLineStructured,
} from "./parse-ingredient-line-structured";

describe("parseIngredientLineStructured", () => {
  it("parses quantity, unit, and name", () => {
    const result = parseIngredientLineStructured("2 cups all-purpose flour");
    expect(result.quantityDecimal).toBe(2);
    expect(result.unit?.toLowerCase()).toBe("cup");
    expect(result.nameNormalized).toContain("flour");
  });

  it("parses fraction quantity", () => {
    const result = parseIngredientLineStructured("1/2 tsp salt");
    expect(result.quantityDecimal).toBeCloseTo(0.5);
    expect(result.unit?.toLowerCase()).toBe("tsp");
  });

  it("defaults to count when quantity present but no unit (e.g. 2 large eggs)", () => {
    const result = parseIngredientLineStructured("2 large eggs");
    expect(result.quantityDecimal).toBe(2);
    expect(result.unit?.toLowerCase()).toBe("count");
    expect(result.nameNormalized).toContain("eggs");
  });

  it("parses HTML lines as plain text (strips tags and decodes entities)", () => {
    const result = parseIngredientLineStructured("<span>2 cups</span> all-purpose flour");
    expect(result.quantityDecimal).toBe(2);
    expect(result.unit?.toLowerCase()).toBe("cup");
    expect(result.nameNormalized).toContain("flour");
    const withEntity = parseIngredientLineStructured("1 tsp salt &amp; pepper");
    expect(withEntity.quantityDecimal).toBe(1);
    expect(withEntity.nameNormalized).toContain("salt");
    expect(withEntity.nameNormalized).toContain("pepper");
    expect(withEntity.nameNormalized).toContain("&"); // &amp; decoded to &
  });
});

describe("mergeParsedIntoStructured", () => {
  it("applies valid parsed values and keeps existing when parse is invalid", () => {
    const parsed: ParsedIngredientLineStructured = {
      rawText: "garbage",
      nameNormalized: null,
      quantityDecimal: null,
      unit: null,
      parseConfidence: 0.5,
    };
    const existing = {
      quantity: 1,
      unit: "CUP" as const,
      ingredientName: "flour",
    };
    const merged = mergeParsedIntoStructured(parsed, existing);
    expect(merged.quantity).toBe(1);
    expect(merged.unit).toBe("CUP");
    expect(merged.nameNormalized).toBe("flour");
  });

  it("never wipes valid existing data with invalid parse", () => {
    const parsed: ParsedIngredientLineStructured = {
      rawText: "2 cups flour",
      nameNormalized: "flour",
      quantityDecimal: 2,
      unit: "cup",
      parseConfidence: 0.9,
    };
    const existing = {
      quantity: 1.5,
      unit: "tbsp" as const,
      ingredientName: "butter",
    };
    const merged = mergeParsedIntoStructured(parsed, existing);
    expect(merged.quantity).toBe(2);
    expect(merged.unit).toBe("cup");
    expect(merged.nameNormalized).toBe("flour");
  });

  it("keeps existing when parsed value is missing", () => {
    const parsed: ParsedIngredientLineStructured = {
      rawText: "flour",
      nameNormalized: "flour",
      quantityDecimal: null,
      unit: null,
      parseConfidence: 0.6,
    };
    const existing = {
      quantity: 2,
      unit: "cup" as const,
    };
    const merged = mergeParsedIntoStructured(parsed, existing);
    expect(merged.quantity).toBe(2);
    expect(merged.unit).toBe("cup");
    expect(merged.nameNormalized).toBe("flour");
  });
});
