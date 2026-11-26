import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { createContext } from "astro/middleware";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "@/test/d1";
import PublicRecipePage from "@/pages/r/[slug]/index.astro";
import { GET as publicPhoto, HEAD as publicPhotoHead } from "@/pages/r/[slug]/photo";
import { GET as ownerPhoto, HEAD as ownerPhotoHead } from "@/pages/recipe-photos/[id]";
import { getPublicRecipe } from "./public-recipe";

const runtime = vi.hoisted(() => ({ env: {} as Cloudflare.Env }));
vi.mock("cloudflare:workers", () => ({ env: runtime.env }));

const origin = "https://quickpantry.app";
const slug = "a".repeat(24);
const privateSlug = "b".repeat(24);
const missingSlug = "c".repeat(24);
const key = "recipe-photos/private-recipe-id";
const flags = vi.fn<(key: string, fallback: boolean, context?: unknown) => Promise<boolean>>();
const bucket = { head: vi.fn(), get: vi.fn() };
let test: ReturnType<typeof createTestDb>;
let astro: AstroContainer;

function image(contentType = "image/png") {
  return {
    size: 10,
    body: new Blob(["photo data"]).stream(),
    writeHttpMetadata(headers: Headers) {
      headers.set("Content-Type", contentType);
      headers.set("Cache-Control", "public, max-age=3600");
      headers.set("Content-Disposition", "attachment; filename=private-file.png");
    },
  };
}

beforeEach(async () => {
  test = createTestDb();
  astro = await AstroContainer.create();
  flags.mockReset().mockResolvedValue(true);
  bucket.head.mockReset().mockImplementation(async (objectKey) => objectKey === key ? image() : null);
  bucket.get.mockReset().mockImplementation(async (objectKey) => objectKey === key ? image() : null);
  Object.assign(runtime.env, { AUTH_URL: origin, DB: test.binding, FLAGS: { getBooleanValue: flags }, RECIPE_PHOTOS: bucket });
  test.sqlite.exec(`
    INSERT INTO user (id, name, email, createdAt, updatedAt) VALUES
      ('private-owner-id', 'Owner', 'owner@example.test', 1, 1), ('other-owner', 'Other', 'other@example.test', 1, 1);
    INSERT INTO Recipe (id, userId, title, sourceUrl, imageUrl, imageStorageKey, servings, prepTimeMinutes,
                        cookTimeMinutes, totalTimeMinutes, notes, isPublic, publicSlug, publishedAt, lastViewedAt) VALUES
      ('private-recipe-id', 'private-owner-id', '<script>alert(1)</script> Soup', 'https://cook.example.com/soup',
        'https://old-bucket.example.com/${key}?v=1', '${key}', 4, 10, 20, 30, 'Secret notes', 1, '${slug}', 1, 123),
      ('other-recipe', 'other-owner', 'Other soup', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 0, '${privateSlug}', NULL, NULL);
    INSERT INTO Ingredient (id, userId, name, normalizedName, costBasisUnit, estimatedCentsPerBasisUnit)
      VALUES ('private-catalog-id', 'private-owner-id', 'Secret catalog name', 'secret catalog name', 'G', 12);
    INSERT INTO Tag (id, userId, name) VALUES ('private-tag', 'private-owner-id', 'Secret tag');
    INSERT INTO RecipeTag (id, recipeId, tagId) VALUES ('private-tag-link', 'private-recipe-id', 'private-tag');
    INSERT INTO RecipeIngredient (id, recipeId, ingredientId, displayText, rawText, quantity, unit, sortOrder)
      VALUES ('private-line-id', 'private-recipe-id', 'private-catalog-id', '<img src=x onerror=alert(1)> onions', 'Secret raw text', 2, 'COUNT', 1),
             ('private-line-id-2', 'private-recipe-id', NULL, 'broth', NULL, 0.5, 'CUP', 0);
    INSERT INTO RecipeInstruction (id, recipeId, text, sortOrder)
      VALUES ('private-step-id', 'private-recipe-id', 'Serve <svg onload=alert(1)> warm.', 1),
             ('private-step-id-2', 'private-recipe-id', 'Simmer for 20 minutes.', 0);
  `);
});

afterEach(() => {
  vi.restoreAllMocks();
  test.sqlite.close();
});

function page(shareSlug = slug, init?: RequestInit) {
  return astro.renderToResponse(PublicRecipePage, {
    request: new Request(`${origin}/r/${encodeURIComponent(shareSlug)}`, init),
    params: { slug: shareSlug },
    partial: false,
  });
}

function photo(shareSlug = slug, init?: RequestInit) {
  const request = new Request(`${origin}/r/${encodeURIComponent(shareSlug)}/photo`, init);
  return (request.method === "HEAD" ? publicPhotoHead : publicPhoto)(createContext({
    request, params: { slug: shareSlug }, defaultLocale: "en",
  }));
}

function legacyPhoto(userId?: string, id = "private-recipe-id", init?: RequestInit) {
  const request = new Request(`${origin}/recipe-photos/${id}`, init);
  const session = userId ? {
    userId, id: "test-session", token: "test-token", createdAt: new Date(), updatedAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
  } : null;
  const context = createContext({ request, params: { id }, defaultLocale: "en" });
  Object.assign(context.locals, { user: null, session });
  return (request.method === "HEAD" ? ownerPhotoHead : ownerPhoto)(context);
}

async function expectNotFound(response: Response, { page = false, head = false } = {}) {
  expect(response.status).toBe(404);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  expect(response.headers.get("x-robots-tag")).toBe(page ? "noindex" : null);
  expect(response.headers.has("location")).toBe(false);
  expect(response.headers.has("etag")).toBe(false);
  expect(await response.text()).toBe(head ? "" : "Not found");
}

describe("public recipe page", () => {
  it("projects only public fields and renders text, order, measurements, and checked media", async () => {
    const projected = await getPublicRecipe(test.db, runtime.env.RECIPE_PHOTOS, slug, [new URL(origin)]);
    expect(projected).toEqual({
      title: "<script>alert(1)</script> Soup", servings: 4, prepTimeMinutes: 10, cookTimeMinutes: 20, totalTimeMinutes: 30,
      ingredients: [{ displayText: "broth", quantity: 0.5, unit: "CUP" }, { displayText: "<img src=x onerror=alert(1)> onions", quantity: 2, unit: "COUNT" }],
      instructions: ["Simmer for 20 minutes.", "Serve <svg onload=alert(1)> warm."],
      sourceUrl: "https://cook.example.com", photoPath: `/r/${slug}/photo`,
    });

    const response = await page();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    const html = await response.text();
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; Soup");
    expect(html).toMatch(/1\/2 cup broth[\s\S]+2 &lt;img src=x onerror=alert\(1\)&gt; onions/);
    expect(html).toMatch(/Simmer for 20 minutes\.[\s\S]+Serve &lt;svg onload=alert\(1\)&gt; warm\./);
    expect(html).toContain(`src="/r/${slug}/photo"`);
    expect(html).toContain('href="https://cook.example.com"');
    expect(html).not.toContain("cook.example.com/soup");
    expect(html).not.toMatch(/<script|astro-island|<svg onload|<img src=x|\bprops=|Secret|private-|owner@example\.test|old-bucket\.example\.com/);
    expect(test.sqlite.prepare("SELECT lastViewedAt FROM Recipe WHERE id = 'private-recipe-id'").get()).toEqual({ lastViewedAt: 123 });
    expect(bucket.get).not.toHaveBeenCalled();
  });

  it.each([
    "javascript:alert(1)", "data:text/html,secret", "https://owner:password@cook.example.com/soup",
    "https://cook.example.com/soup?token=secret", "https://cook.example.com/soup#private-token",
    "https://quickpantry.app./recipes/private-recipe-id", "http://127.0.0.1/soup", "http://[::1]/soup",
    "http://localhost/soup", "https://cook.internal/soup", "https://private-bucket.r2.dev/soup",
    `https://old-bucket.example.com/${key}`,
  ])("omits unsafe or possibly private source URL %s", async (source) => {
    test.sqlite.prepare("UPDATE Recipe SET sourceUrl = ? WHERE id = 'private-recipe-id'").run(source);
    const html = await (await page()).text();
    expect(html).not.toContain("Recipe source:");
    expect(html).not.toContain(source);
  });

  it.each(["external", "mismatched key", "missing object", "invalid MIME type"])("uses the branded fallback: %s", async (variant) => {
    if (variant === "external" || variant === "mismatched key") {
      test.sqlite.prepare("UPDATE Recipe SET imageUrl = 'https://remote.example.com/private.png', imageStorageKey = ? WHERE id = 'private-recipe-id'")
        .run(variant === "external" ? null : "recipe-photos/other-recipe");
    } else {
      bucket.head.mockResolvedValue(variant === "missing object" ? null : image("text/html"));
      bucket.get.mockResolvedValue(variant === "missing object" ? null : image("text/html"));
    }
    const network = vi.spyOn(globalThis, "fetch");
    const response = await page();
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('class="photo-fallback');
    expect(html).not.toContain("remote.example.com");
    expect(html).not.toContain(`/r/${slug}/photo`);
    await expectNotFound(await photo());
    expect(network).not.toHaveBeenCalled();
    if (variant === "external" || variant === "mismatched key") {
      expect(bucket.head).not.toHaveBeenCalled();
      expect(bucket.get).not.toHaveBeenCalled();
    }
  });
});

describe("recipe publication and photo access", () => {
  it.each(["invalid slug", `1${slug.slice(1)}`, `${slug}\n`, slug.toUpperCase(), privateSlug, missingSlug])(
    "returns equivalent not-found responses for %s", async (value) => {
      await expectNotFound(await page(value), { page: true });
      await expectNotFound(await photo(value));
      expect(bucket.head).not.toHaveBeenCalled();
      expect(bucket.get).not.toHaveBeenCalled();
    },
  );

  it.each(["disabled", "missing binding", "rejected evaluation"])("fails closed without querying D1 or R2: %s", async (variant) => {
    if (variant === "disabled") flags.mockResolvedValue(false);
    if (variant === "missing binding") Object.assign(runtime.env, { FLAGS: undefined });
    if (variant === "rejected evaluation") flags.mockRejectedValue(new Error("Flag unavailable"));
    const batch = vi.spyOn(test.binding, "batch");
    const prepare = vi.spyOn(test.binding, "prepare");
    const headers = { cookie: "better-auth.session_token=visitor" };
    await expectNotFound(await page(slug, { headers }), { page: true });
    await expectNotFound(await photo(slug, { method: "HEAD", headers }), { head: true });
    for (const [flag, fallback, context] of flags.mock.calls) {
      expect([flag, fallback, context]).toEqual(["public-recipe-sharing", false, {}]);
    }
    expect(flags).toHaveBeenCalledTimes(variant === "missing binding" ? 0 : 2);
    expect(batch).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(bucket.head).not.toHaveBeenCalled();
    expect(bucket.get).not.toHaveBeenCalled();
  });

  it("streams only the current public photo with safe headers and revokes the old URL after visibility changes", async () => {
    const response = await photo();
    expect(response.status).toBe(200);
    expect(Object.fromEntries(response.headers)).toEqual({
      "cache-control": "no-store", "content-length": "10", "content-type": "image/png", "x-content-type-options": "nosniff",
    });
    expect(await response.text()).toBe("photo data");
    expect(bucket.get).toHaveBeenCalledExactlyOnceWith(key);

    const photoHead = await photo(slug, { method: "HEAD" });
    expect(photoHead.status).toBe(200);
    expect(Object.fromEntries(photoHead.headers)).toEqual(Object.fromEntries(response.headers));
    expect(photoHead.body).toBeNull();
    expect(bucket.head).toHaveBeenCalledExactlyOnceWith(key);
    expect(bucket.get).toHaveBeenCalledOnce();

    const currentPage = await page(slug, { method: "HEAD" });
    expect(currentPage.status).toBe(200);
    expect(currentPage.headers.get("cache-control")).toBe("no-store");
    expect(currentPage.headers.get("x-robots-tag")).toBe("noindex");
    test.sqlite.exec("UPDATE Recipe SET title = 'Latest title' WHERE id = 'private-recipe-id'");
    await expect((await page()).text()).resolves.toContain("Latest title");

    for (const change of ["UPDATE Recipe SET isPublic = 0 WHERE id = 'private-recipe-id'", "DELETE FROM Recipe WHERE id = 'private-recipe-id'"]) {
      bucket.get.mockClear();
      bucket.head.mockClear();
      test.sqlite.exec(change);
      const headers = { "if-none-match": '"prior-validator"', "if-modified-since": "Wed, 25 Nov 2026 00:00:00 GMT" };
      await expectNotFound(await page(slug, { headers }), { page: true });
      const pageHead = await page(slug, { method: "HEAD", headers });
      expect(pageHead.status).toBe(404);
      expect(pageHead.headers.get("cache-control")).toBe("no-store");
      expect(pageHead.headers.get("x-robots-tag")).toBe("noindex");
      await expectNotFound(await photo(slug, { headers }));
      await expectNotFound(await photo(slug, { method: "HEAD", headers }), { head: true });
      expect(bucket.head).not.toHaveBeenCalled();
      expect(bucket.get).not.toHaveBeenCalled();
    }
  });

  it("restricts the legacy URL to the recipe owner even for a public recipe", async () => {
    await expectNotFound(await legacyPhoto());
    await expectNotFound(await legacyPhoto("other-owner"));
    await expectNotFound(await legacyPhoto("other-owner", "private-recipe-id", { method: "HEAD" }), { head: true });
    await expectNotFound(await legacyPhoto("private-owner-id", "other-recipe"));
    expect(bucket.get).not.toHaveBeenCalled();
    expect(bucket.head).not.toHaveBeenCalled();

    flags.mockResolvedValue(false);
    const response = await legacyPhoto("private-owner-id");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("photo data");
    const head = await legacyPhoto("private-owner-id", "private-recipe-id", { method: "HEAD" });
    expect(head.status).toBe(200);
    expect(head.body).toBeNull();
    expect(bucket.get).toHaveBeenCalledExactlyOnceWith(key);
    expect(bucket.head).toHaveBeenCalledExactlyOnceWith(key);
    expect(flags).not.toHaveBeenCalled();
  });
});
