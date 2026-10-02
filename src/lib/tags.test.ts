import { describe, expect, it } from "vitest";
import { formatTagName } from "./tags";

describe("formatTagName", () => {
  it("capitalizes the first letter of each word", () => {
    expect(formatTagName("weeknight dinner")).toBe("Weeknight Dinner");
  });

  it("leaves existing capitals and inner hyphens alone", () => {
    expect(formatTagName("BBQ")).toBe("BBQ");
    expect(formatTagName("one-pot")).toBe("One-pot");
  });

  it("trims and collapses whitespace", () => {
    expect(formatTagName("  quick   lunch ")).toBe("Quick Lunch");
  });

  it("handles non-ASCII lowercase letters", () => {
    expect(formatTagName("épicé")).toBe("Épicé");
  });
});
