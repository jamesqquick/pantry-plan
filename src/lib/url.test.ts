import { describe, it, expect } from "vitest";
import {
  httpUrlSchema,
  isSafeHttpUrl,
  optionalHttpUrlSchema,
} from "./url";

describe("isSafeHttpUrl", () => {
  it("accepts plain http and https URLs", () => {
    expect(isSafeHttpUrl("http://example.com")).toBe(true);
    expect(isSafeHttpUrl("https://example.com")).toBe(true);
    expect(isSafeHttpUrl("https://example.com/recipes/abc")).toBe(true);
    expect(isSafeHttpUrl("https://example.com:8443/path?q=1#frag")).toBe(true);
  });

  it("rejects javascript: URLs (XSS via <a href>)", () => {
    expect(isSafeHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("JavaScript:alert(1)")).toBe(false);
    expect(isSafeHttpUrl("  javascript:alert(1)  ")).toBe(false);
  });

  it("rejects data: URLs (XSS via <img>/document)", () => {
    expect(isSafeHttpUrl("data:text/html,<script>alert(1)</script>")).toBe(
      false,
    );
    expect(isSafeHttpUrl("data:image/png;base64,iVBORw0KGgo=")).toBe(false);
  });

  it("rejects vbscript: URLs", () => {
    expect(isSafeHttpUrl("vbscript:msgbox(1)")).toBe(false);
  });

  it("rejects file: URLs", () => {
    expect(isSafeHttpUrl("file:///etc/passwd")).toBe(false);
  });

  it("rejects mailto: and ftp: URLs", () => {
    expect(isSafeHttpUrl("mailto:nobody@example.com")).toBe(false);
    expect(isSafeHttpUrl("ftp://example.com/file")).toBe(false);
  });

  it("rejects relative paths and bare strings", () => {
    expect(isSafeHttpUrl("/recipes")).toBe(false);
    expect(isSafeHttpUrl("recipes")).toBe(false);
    expect(isSafeHttpUrl("//example.com")).toBe(false);
    expect(isSafeHttpUrl("")).toBe(false);
  });

  it("rejects malformed URLs", () => {
    expect(isSafeHttpUrl("ht!tp://example.com")).toBe(false);
    expect(isSafeHttpUrl("http:// space.com")).toBe(false);
  });
});

describe("httpUrlSchema", () => {
  it("accepts valid http(s) URLs", () => {
    expect(httpUrlSchema.parse("https://example.com").length).toBeGreaterThan(
      0,
    );
  });

  it("rejects javascript: URLs at parse time", () => {
    expect(() => httpUrlSchema.parse("javascript:alert(1)")).toThrow();
  });

  it("rejects empty strings (URL is required)", () => {
    expect(() => httpUrlSchema.parse("")).toThrow();
  });
});

describe("optionalHttpUrlSchema", () => {
  it("accepts valid http(s) URLs", () => {
    expect(optionalHttpUrlSchema.parse("https://example.com")).toBe(
      "https://example.com",
    );
  });

  it("accepts empty string as 'no URL provided'", () => {
    expect(optionalHttpUrlSchema.parse("")).toBe("");
  });

  it("accepts undefined as 'no URL provided'", () => {
    expect(optionalHttpUrlSchema.parse(undefined)).toBeUndefined();
  });

  it("rejects javascript: URLs", () => {
    expect(() => optionalHttpUrlSchema.parse("javascript:alert(1)")).toThrow();
  });

  it("rejects data: URLs", () => {
    expect(() =>
      optionalHttpUrlSchema.parse("data:text/html,<script>alert(1)</script>"),
    ).toThrow();
  });

  it("rejects relative paths (must be absolute http/https)", () => {
    expect(() => optionalHttpUrlSchema.parse("/recipes")).toThrow();
    expect(() => optionalHttpUrlSchema.parse("//evil.com")).toThrow();
  });
});
