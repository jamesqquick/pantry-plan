import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHtml } from "./fetch-html";

afterEach(() => vi.restoreAllMocks());

describe("fetchHtml", () => {
  it("uses manual redirect handling", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html></html>", {
        headers: { "content-type": "text/html" },
      }),
    );

    await fetchHtml("https://example.com/recipe");

    expect(fetchMock).toHaveBeenCalledWith(
      new URL("https://example.com/recipe"),
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("follows safe redirects, including relative locations", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: { location: "/recipe/" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("<html></html>", {
          headers: { "content-type": "text/html" },
        }),
      );

    await expect(fetchHtml("https://example.com/recipe")).resolves.toBe(
      "<html></html>",
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      new URL("https://example.com/recipe/"),
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it.each([
    "http://localhost/private",
    "http://127.0.0.1/private",
    "http://192.168.1.1/private",
    "ftp://example.com/recipe",
  ])("rejects unsafe redirect destinations: %s", async (location) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 302, headers: { location } }),
    );

    await expect(fetchHtml("https://example.com/recipe")).rejects.toThrow(
      "unsafe or unsupported URL",
    );
  });

  it("rejects redirects without a location", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 302 }),
    );

    await expect(fetchHtml("https://example.com/recipe")).rejects.toThrow(
      "did not include a destination",
    );
  });

  it("rejects redirect loops after the maximum", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "/recipe" },
      }),
    );

    await expect(fetchHtml("https://example.com/recipe")).rejects.toThrow(
      "redirected too many times",
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("rejects responses larger than the body limit", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html></html>", {
        headers: {
          "content-type": "text/html",
          "content-length": "1000001",
        },
      }),
    );

    await expect(fetchHtml("https://example.com/recipe")).rejects.toThrow(
      "Recipe page is too large",
    );
  });
});
