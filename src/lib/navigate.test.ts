import { describe, it, expect } from "vitest";
import { safeRelativePath } from "./navigate";

describe("safeRelativePath", () => {
  it("accepts normal same-origin paths", () => {
    expect(safeRelativePath("/recipes")).toBe("/recipes");
    expect(safeRelativePath("/meal-plan/2026-01-01")).toBe(
      "/meal-plan/2026-01-01",
    );
    expect(safeRelativePath("/r")).toBe("/r");
  });

  it("preserves query strings and hashes", () => {
    expect(safeRelativePath("/recipes?q=foo")).toBe("/recipes?q=foo");
    expect(safeRelativePath("/recipes#section")).toBe("/recipes#section");
  });

  it("rejects protocol-relative URLs", () => {
    expect(safeRelativePath("//evil.com")).toBe("/");
    expect(safeRelativePath("//evil.com/path")).toBe("/");
  });

  it("rejects backslash variants used to bypass naive checks", () => {
    expect(safeRelativePath("/\\evil.com")).toBe("/");
    expect(safeRelativePath("\\\\evil.com")).toBe("/");
  });

  it("rejects absolute URLs", () => {
    expect(safeRelativePath("https://evil.com")).toBe("/");
    expect(safeRelativePath("http://evil.com")).toBe("/");
    expect(safeRelativePath("javascript:alert(1)")).toBe("/");
  });

  it("rejects empty, undefined, and non-string values", () => {
    expect(safeRelativePath("")).toBe("/");
    expect(safeRelativePath(undefined)).toBe("/");
    expect(safeRelativePath(null)).toBe("/");
    // @ts-expect-error — runtime safety check
    expect(safeRelativePath(123)).toBe("/");
  });

  it("rejects bare slash (no path segment)", () => {
    expect(safeRelativePath("/")).toBe("/");
  });

  it("uses the supplied fallback when input is unsafe", () => {
    expect(safeRelativePath("//evil.com", "/recipes")).toBe("/recipes");
    expect(safeRelativePath(undefined, "/recipes")).toBe("/recipes");
  });
});
