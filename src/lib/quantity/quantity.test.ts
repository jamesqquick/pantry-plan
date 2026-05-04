import { describe, it, expect } from "vitest";
import {
  parseQuantityText,
  formatQuantity,
  normalizeQuantityText,
  adjustQuantity,
} from "./quantity";

describe("parseQuantityText", () => {
  it("parses integers", () => {
    expect(parseQuantityText("2")).toBe(2);
    expect(parseQuantityText("0")).toBe(0);
  });
  it("parses decimals", () => {
    expect(parseQuantityText("2.25")).toBeCloseTo(2.25);
    expect(parseQuantityText("1.5")).toBeCloseTo(1.5);
  });
  it("parses fractions", () => {
    expect(parseQuantityText("1/3")).toBeCloseTo(1 / 3);
    expect(parseQuantityText("1/2")).toBe(0.5);
  });
  it("parses mixed numbers", () => {
    expect(parseQuantityText("1 1/2")).toBeCloseTo(1.5);
    expect(parseQuantityText("1-1/2")).toBeCloseTo(1.5);
  });
  it("parses unicode fractions", () => {
    expect(parseQuantityText("½")).toBe(0.5);
    expect(parseQuantityText("¼")).toBe(0.25);
    expect(parseQuantityText("¾")).toBeCloseTo(0.75);
    expect(parseQuantityText("⅓")).toBeCloseTo(1 / 3);
  });
  it("returns null for empty", () => {
    expect(parseQuantityText("")).toBeNull();
    expect(parseQuantityText("   ")).toBeNull();
  });
  it("returns null for negative", () => {
    expect(parseQuantityText("-1")).toBeNull();
  });
  it("returns null for denominator 0", () => {
    expect(parseQuantityText("1/0")).toBeNull();
  });
});

describe("formatQuantity", () => {
  it("formats integers", () => {
    expect(formatQuantity(2)).toBe("2");
    expect(formatQuantity(0)).toBe("0");
  });
  it("formats mixed numbers", () => {
    expect(formatQuantity(1.5)).toBe("1 1/2");
    expect(formatQuantity(2.25)).toBe("2 1/4");
  });
  it("formats fractions only", () => {
    expect(formatQuantity(0.75)).toBe("3/4");
    expect(formatQuantity(0.5)).toBe("1/2");
  });
  it("never displays decimals", () => {
    expect(formatQuantity(1.5)).not.toMatch(/\d+\.\d+/);
    expect(formatQuantity(0.3333)).not.toMatch(/\d+\.\d+/);
  });
});

describe("normalizeQuantityText", () => {
  it("normalizes valid input to fraction display", () => {
    expect(normalizeQuantityText("1.5").normalizedText).toBe("1 1/2");
    expect(normalizeQuantityText("0.75").normalizedText).toBe("3/4");
    expect(normalizeQuantityText("2").normalizedText).toBe("2");
  });
  it("returns empty for empty input", () => {
    const r = normalizeQuantityText("");
    expect(r.normalizedText).toBe("");
    expect(r.value).toBeNull();
    expect(r.isValid).toBe(true);
  });
  it("returns invalid for bad input", () => {
    const r = normalizeQuantityText("abc");
    expect(r.isValid).toBe(false);
    expect(r.value).toBeNull();
  });
});

describe("adjustQuantity", () => {
  it("steps up by 0.25", () => {
    expect(adjustQuantity(1, "up")).toBe(1.25);
    expect(adjustQuantity(0, "up")).toBe(0.25);
  });
  it("steps down by 0.25 and does not go below 0", () => {
    expect(adjustQuantity(1, "down")).toBe(0.75);
    expect(adjustQuantity(0.25, "down")).toBe(0);
    expect(adjustQuantity(0, "down")).toBe(0);
  });
});
