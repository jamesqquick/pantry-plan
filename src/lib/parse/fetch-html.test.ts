import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHtml } from "./fetch-html";

afterEach(() => vi.restoreAllMocks());

describe("fetchHtml", () => {
  it("does not follow redirects", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html></html>", {
        headers: { "content-type": "text/html" },
      }),
    );

    await fetchHtml("https://example.com/recipe");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/recipe",
      expect.objectContaining({ redirect: "error" }),
    );
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
