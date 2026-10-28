import { describe, it, expect } from "vitest";
import {
  parseIngredientLineStructured,
  mergeParsedIntoStructured,
  parseScalableIngredientLine,
  type ParsedIngredientLineStructured,
} from "./parse-ingredient-line-structured";

describe("parseScalableIngredientLine", () => {
  it.each([
    ["2 cups flour", 2, "CUP", "flour"],
    ["1 1/2 cups flour", 1.5, "CUP", "flour"],
    ["2 and 1/4 cups flour", 2.25, "CUP", "flour"],
    ["1 and 1/2 teaspoons cornstarch", 1.5, "TSP", "cornstarch"],
    ["1-1/2 cups flour", 1.5, "CUP", "flour"],
    ["1½ cups flour", 1.5, "CUP", "flour"],
    ["½ tsp salt", 0.5, "TSP", "salt"],
    ["11/2 cups flour", 5.5, "CUP", "flour"],
    [".5 cup milk", 0.5, "CUP", "milk"],
    ["400g flour", 400, "G", "flour"],
    ["400g tin chopped tomatoes", 400, "G", "tin chopped tomatoes"],
    ["12 oz bag chocolate chips", 12, "OZ", "bag chocolate chips"],
    ["2 large eggs", 2, "COUNT", "large eggs"],
    ["1 large egg + 1 egg yolk", 1, "COUNT", "large egg + 1 egg yolk"],
    ["2 large eggs plus 1 tsp salt", 2, "COUNT", "large eggs plus 1 tsp salt"],
    ["2 (14-ounce) cans tomatoes", 2, "COUNT", "(14-ounce) cans tomatoes"],
    ["1 cup 2% milk", 1, "CUP", "2% milk"],
    ["1 cup milk plus 2 tbsp for brushing", 1, "CUP", "milk plus 2 tbsp for brushing"],
    ["1 cup flour (120 g)", 1, "CUP", "flour (120 g)"],
    ["1 cup flour (⅕ kg)", 1, "CUP", "flour (⅕ kg)"],
    ["1 cup plus a tablespoon sugar", 1, "CUP", "plus a tablespoon sugar"],
    ["1 cup or two cups milk", 1, "CUP", "or two cups milk"],
    ["1 cup and a half flour", 1, "CUP", "and a half flour"],
    ["1 cup + a tablespoon sugar", 1, "CUP", "+ a tablespoon sugar"],
    ["1 cup minus a tablespoon flour", 1, "CUP", "minus a tablespoon flour"],
    ["1 tbsp butter (half an ounce)", 1, "TBSP", "butter (half an ounce)"],
    ["1 cup sugar, plus another tablespoon", 1, "CUP", "sugar, plus another tablespoon"],
    ["1 cup sugar, and another tablespoon", 1, "CUP", "sugar, and another tablespoon"],
    ["1 cup sugar, plus extra tablespoon", 1, "CUP", "sugar, plus extra tablespoon"],
    ["1 cup sugar with an extra tablespoon", 1, "CUP", "sugar with an extra tablespoon"],
    ["400g small tin chopped tomatoes", 400, "G", "small tin chopped tomatoes"],
    ["12 oz resealable bag chocolate chips", 12, "OZ", "resealable bag chocolate chips"],
    ["400 g (one tin) chopped tomatoes", 400, "G", "(one tin) chopped tomatoes"],
    ["1 cup half and half", 1, "CUP", "half and half"],
    ["1 cup half-and-half", 1, "CUP", "half-and-half"],
    ["2 cups semisweet chocolate chips ((12 oz))", 2, "CUP", "semisweet chocolate chips ((12 oz))"],
    ["<span>2 cups</span> flour", 2, "CUP", "flour"],
  ])("extracts the first amount from %s", (text, quantity, unit, displayText) => {
    expect(parseScalableIngredientLine(text as string)).toEqual({
      kind: "scalable", quantity, unit, displayText,
    });
  });

  it.each([
    "2-3 cloves garlic", "2 – 3 cloves garlic", "2 to 3 cloves garlic",
    "about 2 cups flour", "1/0 cup milk", "1,000 g flour", "1.5.2 cups flour", "2x400g tomatoes",
    "1e3 g flour", "-1 cup milk", "flour", "2", "1/2/3 cup milk",
    "1 ⅙ tsp salt", "Salt to taste, plus ⅙ tsp",
    "0.75 l milk", "500 ml milk", "1 fl oz vanilla", "1 pint cream",
    "2 heaping tbsp sugar", "2 rounded tsp sugar", "2 heaped tablespoons sugar",
    "1 to 2% salt", "2 to 3% milk", "1 or 2% salt",
    `${"1" + "0".repeat(303)} g flour`,
  ])("preserves an unsupported or ambiguous line: %s", (text) => {
    expect(parseScalableIngredientLine(text)).toEqual({ kind: "needs-review", displayText: text });
  });

  it.each(["Salt to taste", "Oil as needed", "Flour for dusting", "Basil for garnish"])("does not treat %s as a parsing error", (text) => {
    expect(parseScalableIngredientLine(text)).toEqual({ kind: "unquantified", displayText: text });
  });
});

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
