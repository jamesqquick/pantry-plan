import { createId } from "@paralleldrive/cuid2";
import type { ActionAPIContext } from "astro:actions";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createTestDb } from "@/test/d1";
import { recipes } from "./recipes";

const runtime = vi.hoisted(() => ({
  env: {} as { DB: D1Database; AUTH_URL: string; FLAGS?: Pick<Flagship, "getBooleanValue"> },
  getBooleanValue: vi.fn<Flagship["getBooleanValue"]>(),
}));

vi.mock("cloudflare:workers", () => ({ env: runtime.env }));
vi.mock("astro:actions", async () => {
  const { defineAction } = await import("../../node_modules/astro/dist/actions/runtime/server.js");
  const { ActionError } = await import("../../node_modules/astro/dist/actions/runtime/client.js");
  return { defineAction, ActionError };
});
vi.mock("@paralleldrive/cuid2", async (importOriginal) => {
  const original = await importOriginal<typeof import("@paralleldrive/cuid2")>();
  return { ...original, createId: vi.fn(original.createId) };
});

const input = { id: "existing" };
const privateState = { isPublic: false, publicSlug: null, publishedAt: null, publicUrl: null };
const firstPublishedAt = new Date("2026-11-25T16:30:00.123Z");
const collision = `a${"0".repeat(23)}`;
let test: ReturnType<typeof createTestDb>;

function context(user = { id: "cook", role: "USER" } as { id: string; role: string } | null) {
  const url = new URL("https://request.example.test/_actions/recipes.publish");
  return {
    [Symbol.for("astro.actionAPIContext")]: true,
    request: new Request(url, { headers: { "x-forwarded-host": "forwarded.example.test" } }),
    url,
    locals: { user },
  } as unknown as ActionAPIContext;
}

function savedRow(id = input.id) {
  return test.sqlite.prepare("SELECT isPublic, publicSlug, publishedAt FROM Recipe WHERE id = ?").get(id);
}

function reserveCollision() {
  test.sqlite.prepare("UPDATE Recipe SET publicSlug = ?, publishedAt = ? WHERE id = 'foreign'")
    .run(collision, firstPublishedAt.getTime());
}

beforeEach(() => {
  test = createTestDb();
  runtime.getBooleanValue.mockReset().mockResolvedValue(true);
  Object.assign(runtime.env, {
    DB: test.binding,
    AUTH_URL: "https://quickpantry.app",
    FLAGS: { getBooleanValue: runtime.getBooleanValue },
  });
  vi.mocked(createId).mockReset();
  test.sqlite.exec(`
    INSERT INTO user (id, name, email, createdAt, updatedAt) VALUES
      ('cook', 'Cook', 'cook@example.test', 1, 1),
      ('other', 'Other', 'other@example.test', 1, 1);
    INSERT INTO Recipe (id, userId, title) VALUES
      ('existing', 'cook', 'Soup'), ('foreign', 'other', 'Other soup');
  `);
});

afterEach(() => {
  vi.restoreAllMocks();
  test.sqlite.close();
});

it("publishes, reads, revokes, and republishes without rotating the link or first timestamp", async () => {
  const clock = vi.spyOn(Date, "now").mockReturnValue(firstPublishedAt.getTime());
  const ctx = context();
  expect(await recipes.getSharingState.orThrow.call(ctx, input)).toEqual(privateState);
  expect(await recipes.unpublish.orThrow.call(ctx, input)).toEqual({ ...privateState, changed: false });

  const { changed, ...state } = await recipes.publish.orThrow.call(ctx, input);
  expect(changed).toBe(true);
  expect(state).toEqual({
    isPublic: true,
    publicSlug: expect.stringMatching(/^[a-z][a-z0-9]{23}$/),
    publishedAt: firstPublishedAt.toISOString(),
    publicUrl: `https://quickpantry.app/r/${state.publicSlug}`,
  });
  expect(savedRow()).toEqual({ isPublic: 1, publicSlug: state.publicSlug, publishedAt: firstPublishedAt.getTime() });
  expect(await recipes.getSharingState.orThrow.call(ctx, input)).toEqual(state);

  clock.mockReturnValue(firstPublishedAt.getTime() + 60_000);
  expect(await recipes.publish.orThrow.call(ctx, input)).toEqual({ ...state, changed: false });
  await recipes.update.orThrow.call(ctx, { ...input, title: "Renamed soup", publicSlug: "replacement" });
  const revoked = { ...state, isPublic: false, publicUrl: null };
  expect(await recipes.unpublish.orThrow.call(ctx, input)).toEqual({ ...revoked, changed: true });
  expect(await recipes.getSharingState.orThrow.call(ctx, input)).toEqual(revoked);
  expect(await recipes.unpublish.orThrow.call(ctx, input)).toEqual({ ...revoked, changed: false });
  expect(savedRow()).toEqual({ isPublic: 0, publicSlug: state.publicSlug, publishedAt: firstPublishedAt.getTime() });
  expect(await recipes.publish.orThrow.call(ctx, input)).toEqual({ ...state, changed: true });
});

it.each([
  ["http://localhost:4321", "http://localhost:4321"],
  ["https://recipe-sharing-preview.workers.dev/auth/", "https://recipe-sharing-preview.workers.dev"],
  ["https://quickpantry.app", "https://quickpantry.app"],
])("uses the configured AUTH_URL origin for %s", async (authUrl, origin) => {
  runtime.env.AUTH_URL = authUrl;
  const ctx = context();
  const { publicSlug, publicUrl } = await recipes.publish.orThrow.call(ctx, input);
  expect(publicUrl).toBe(`${origin}/r/${publicSlug}`);
  expect((await recipes.getSharingState.orThrow.call(ctx, input)).publicUrl).toBe(publicUrl);
});

it.each(["getSharingState", "publish", "unpublish"] as const)(
  "%s rejects anonymous users, non-owners (including admins), and missing recipes",
  async (name) => {
    const action = recipes[name];
    if (name !== "publish") {
      test.sqlite.exec("UPDATE Recipe SET isPublic = 1, publicSlug = 'public-soup', publishedAt = 42 WHERE id = 'foreign'");
    }
    const original = savedRow("foreign");
    await expect(action.orThrow.call(context(null), input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(runtime.getBooleanValue).not.toHaveBeenCalled();
    for (const id of ["foreign", "missing"]) {
      await expect(action.orThrow.call(context({ id: "cook", role: "ADMIN" }), { id }))
        .rejects.toMatchObject({ code: "NOT_FOUND", message: "Recipe not found." });
    }
    expect(savedRow("foreign")).toEqual(original);
  },
);

it.each(["getSharingState", "publish", "unpublish"] as const)("%s validates the recipe ID before touching D1", async (name) => {
  const prepare = vi.spyOn(test.binding, "prepare");
  for (const payload of [{}, { id: "" }, { id: 123 }, { id: "a".repeat(101) }]) {
    const result = await recipes[name].call(context(), payload as typeof input);
    expect(result.error).toMatchObject({ code: "BAD_REQUEST", fields: { id: [expect.any(String)] } });
  }
  expect(prepare).not.toHaveBeenCalled();
  expect(runtime.getBooleanValue).not.toHaveBeenCalled();
});

it.each(["missing", "off", "rejected"] as const)("blocks publish with a %s flag and still allows read and revoke", async (flag) => {
  const ctx = context();
  const { publicSlug, publishedAt, publicUrl } = await recipes.publish.orThrow.call(ctx, input);
  const [key, fallback, targeting] = runtime.getBooleanValue.mock.calls[0]!;
  expect([key, fallback]).toEqual(["public-recipe-sharing", false]);
  expect(targeting ?? {}).toEqual({});
  runtime.getBooleanValue.mockClear();
  if (flag === "missing") delete runtime.env.FLAGS;
  if (flag === "off") runtime.getBooleanValue.mockResolvedValue(false);
  if (flag === "rejected") runtime.getBooleanValue.mockRejectedValue(new FlagshipUnavailableError());

  await expect(recipes.publish.orThrow.call(ctx, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(await recipes.getSharingState.orThrow.call(ctx, input)).toEqual({ isPublic: true, publicSlug, publishedAt, publicUrl });
  expect(await recipes.unpublish.orThrow.call(ctx, input)).toEqual({
    isPublic: false, publicSlug, publishedAt, publicUrl: null, changed: true,
  });
  await expect(recipes.publish.orThrow.call(ctx, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(savedRow()).toEqual({ isPublic: 0, publicSlug, publishedAt: Date.parse(publishedAt!) });
  expect(runtime.getBooleanValue).toHaveBeenCalledTimes(flag === "missing" ? 0 : 2);
});

class FlagshipUnavailableError extends Error {}
class WrappedD1Error extends Error {}

it.each(["SQLite", "wrapped D1"])("retries a %s slug collision against a revoked recipe", async (driver) => {
  reserveCollision();
  if (driver === "wrapped D1") {
    const batch = test.binding.batch.bind(test.binding);
    vi.spyOn(test.binding, "batch").mockImplementation(async (statements) => {
      try {
        return await batch(statements);
      } catch (error) {
        if (!(error instanceof Error)) throw error;
        const cause = new WrappedD1Error(`D1_ERROR: ${error.message}: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_UNIQUE)`);
        throw new WrappedD1Error("Query failed", { cause });
      }
    });
  }
  vi.mocked(createId).mockReturnValueOnce(collision);
  const previous = savedRow("foreign");
  const state = await recipes.publish.orThrow.call(context(), input);
  expect(state.changed).toBe(true);
  expect(state.publicSlug).toMatch(/^[a-z][a-z0-9]{23}$/);
  expect(state.publicSlug).not.toBe(collision);
  expect(createId).toHaveBeenCalledTimes(2);
  expect(savedRow()).toEqual({ isPublic: 1, publicSlug: state.publicSlug, publishedAt: Date.parse(state.publishedAt!) });
  expect(savedRow("foreign")).toEqual(previous);
});

it("stops retrying persistent collisions without partially publishing", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  reserveCollision();
  vi.mocked(createId).mockReturnValue(collision);
  await expect(recipes.publish.orThrow.call(context(), input)).rejects.toMatchObject({
    code: "INTERNAL_SERVER_ERROR", message: "Could not create a sharing link. Please try again.",
  });
  expect(createId).toHaveBeenCalledTimes(3);
  expect(savedRow()).toEqual({ isPublic: 0, publicSlug: null, publishedAt: null });
});

it("does not retry another SQLite uniqueness failure", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  test.sqlite.exec(`
    CREATE UNIQUE INDEX test_recipe_title ON Recipe(title);
    CREATE TRIGGER test_title_conflict AFTER UPDATE OF isPublic ON Recipe WHEN NEW.id = 'existing'
    BEGIN
      UPDATE Recipe SET title = 'Other soup' WHERE id = NEW.id;
    END;
  `);
  await expect(recipes.publish.orThrow.call(context(), input)).rejects.toMatchObject({
    code: "INTERNAL_SERVER_ERROR", message: "Could not create a sharing link. Please try again.",
  });
  expect(log).toHaveBeenCalledOnce();
  expect(createId).toHaveBeenCalledOnce();
  expect(savedRow()).toEqual({ isPublic: 0, publicSlug: null, publishedAt: null });
});

it("applies only one transition per set of concurrent identical requests", async () => {
  test.sqlite.exec(`
    CREATE TABLE test_visibility_writes (isPublic INTEGER);
    CREATE TRIGGER test_visibility_write AFTER UPDATE OF isPublic ON Recipe
    BEGIN
      INSERT INTO test_visibility_writes VALUES (NEW.isPublic);
    END;
  `);
  const ctx = context();
  for (const name of ["publish", "unpublish"] as const) {
    const settled = await Promise.all(Array.from({ length: 4 }, () => recipes[name].orThrow.call(ctx, input)));
    expect(settled.filter(({ changed }) => changed)).toHaveLength(1);
    const [first] = settled;
    for (const state of settled) expect(state).toEqual({ ...first, changed: state.changed });
  }
  expect(test.sqlite.prepare("SELECT isPublic FROM test_visibility_writes ORDER BY rowid").all()).toEqual([
    { isPublic: 1 }, { isPublic: 0 },
  ]);
  expect(savedRow()).toEqual({ isPublic: 0, publicSlug: expect.any(String), publishedAt: expect.any(Number) });
});

it("returns the publish no-op snapshot even when revoke commits before its response", async () => {
  const ctx = context();
  const published = await recipes.publish.orThrow.call(ctx, input);
  const publishCommitted = Promise.withResolvers<void>();
  const allowPublishResponse = Promise.withResolvers<void>();
  const batch = test.binding.batch.bind(test.binding);
  vi.spyOn(test.binding, "batch").mockImplementationOnce(async (statements) => {
    const result = await batch(statements);
    publishCommitted.resolve();
    await allowPublishResponse.promise;
    return result;
  });

  const repeatedPublish = recipes.publish.orThrow.call(ctx, input);
  await publishCommitted.promise;
  try {
    expect(await recipes.unpublish.orThrow.call(ctx, input)).toEqual({
      ...published, isPublic: false, publicUrl: null, changed: true,
    });
  } finally {
    allowPublishResponse.resolve();
  }
  expect(await repeatedPublish).toEqual({ ...published, changed: false });
  expect(savedRow()).toMatchObject({ isPublic: 0, publicSlug: published.publicSlug });
});
