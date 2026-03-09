import { describe, it, expect } from "vitest";
import { splitQuantityFromLine } from "./quantity-aware-text";

describe("splitQuantityFromLine", () => {
  it("splits mixed number at start", () => {
    const result = splitQuantityFromLine("1 1/2 cups flour");
    expect(result).not.toBeNull();
    expect(result!.before).toBe("");
    expect(result!.quantity).toBe("1 1/2");
    expect(result!.after).toBe(" cups flour");
  });

  it("splits fraction only at start", () => {
    const result = splitQuantityFromLine("1/2 tsp salt");
    expect(result).not.toBeNull();
    expect(result!.before).toBe("");
    expect(result!.quantity).toBe("1/2");
    expect(result!.after).toBe(" tsp salt");
  });

  it("finds first quantity when not at start", () => {
    const result = splitQuantityFromLine("Flour — 1 1/2 cups");
    expect(result).not.toBeNull();
    expect(result!.before).toBe("Flour — ");
    expect(result!.quantity).toBe("1 1/2");
    expect(result!.after).toBe(" cups");
  });

  it("returns null when no quantity pattern", () => {
    expect(splitQuantityFromLine("No quantity here")).toBeNull();
    expect(splitQuantityFromLine("Preheat oven to 350")).toBeNull();
    expect(splitQuantityFromLine("")).toBeNull();
  });

  it("matches 2 3/4 style mixed number", () => {
    const result = splitQuantityFromLine("2 3/4 cups milk");
    expect(result).not.toBeNull();
    expect(result!.quantity).toBe("2 3/4");
    expect(result!.after).toBe(" cups milk");
  });
});
