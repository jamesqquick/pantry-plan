import { afterEach, expect, it, vi } from "vitest";
import { fetchRecipePhoto, RecipePhotoValidationError } from "./recipe-photos";

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1]);

afterEach(() => vi.restoreAllMocks());

it("downloads a bounded public HTTPS image and checks its signature", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(png, {
    headers: { "content-type": "image/png", "content-length": String(png.length) },
  }));
  const result = await fetchRecipePhoto("https://photos.example.test/photo.png");
  expect(result).toEqual({ bytes: png, contentType: "image/png" });
  expect(fetchMock).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ redirect: "manual" }));
});

it("rejects private targets and unsafe redirects before fetching them", async () => {
  const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, {
    status: 302, headers: { location: "https://127.0.0.1/private.png" },
  }));
  await expect(fetchRecipePhoto("https://localhost/photo.png")).rejects.toBeInstanceOf(RecipePhotoValidationError);
  expect(fetchMock).not.toHaveBeenCalled();
  await expect(fetchRecipePhoto("https://photos.example.test/photo.png")).rejects.toBeInstanceOf(RecipePhotoValidationError);
  expect(fetchMock).toHaveBeenCalledOnce();
});

it("rejects oversized or mismatched image content", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("too large", {
    headers: { "content-type": "image/png", "content-length": "5000000" },
  })).mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), {
    headers: { "content-type": "image/png" },
  }));
  await expect(fetchRecipePhoto("https://photos.example.test/large.png")).rejects.toThrow("4 MB");
  await expect(fetchRecipePhoto("https://photos.example.test/fake.png")).rejects.toThrow("valid JPEG, PNG, or WebP");
});
