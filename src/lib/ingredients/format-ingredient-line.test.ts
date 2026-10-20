import { describe, expect, it } from "vitest";
import { formatIngredientLine, formatIngredientQuantity } from "./format-ingredient-line";

describe("ingredient formatting", () => {
  it("preserves spoon quantities smaller than 1/16", () => {
    expect(formatIngredientQuantity(1 / 32, "TSP")).toBe("1/32");
    expect(formatIngredientQuantity(1 / 64, "TSP")).toBe("1/64");
  });

  it("does not round a positive quantity to zero or an inaccurate fraction", () => {
    expect(formatIngredientQuantity(0.001, "TSP")).toBe("0.001");
    expect(formatIngredientQuantity(0.00001, "G")).toBe("0.00001");
    expect(formatIngredientQuantity(1.2345, "CUP")).toBe("1.2345");
  });

  it("uses decimals for metric weights", () => {
    expect(formatIngredientQuantity(125.5, "G")).toBe("125.5");
    expect(formatIngredientQuantity(0.75, "KG")).toBe("0.75");
  });

  it("formats units, hides count, and preserves unquantified text", () => {
    expect(formatIngredientLine({ quantity: 0.5, unit: "CUP", displayText: "milk" })).toBe("1/2 cup milk");
    expect(formatIngredientLine({ quantity: 2, unit: "CUP", displayText: "milk" })).toBe("2 cups milk");
    expect(formatIngredientLine({ quantity: 2, unit: "COUNT", displayText: "eggs" })).toBe("2 eggs");
    expect(formatIngredientLine({ quantity: null, unit: null, displayText: "salt to taste" })).toBe("salt to taste");
  });
});
