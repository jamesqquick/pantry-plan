import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  ingredient,
  recipe,
  recipeIngredient,
  recipeInstruction,
  recipeSearchIndex,
  recipeTag,
  tag,
  user,
  type Db,
} from "@/db";
import { createTestDb } from "@/test/d1";
import {
  deleteUserSearchIndex,
  findRecipesNeedingSync,
  getRecipeSearchInstance,
  markRecipesDirty,
  MAX_SYNC_ATTEMPTS,
  PRODUCTION_SEARCH_INSTANCE,
  recipeIdsUsingIngredient,
  recipeIdsWithTag,
  reindexAll,
  syncPendingForUser,
  syncRecipes,
  type RecipeSearchInstance,
} from "./recipe-index";

type StoredItem = { id: string; key: string; content: string; metadata: unknown };

function createFakeInstance() {
  const items = new Map<string, StoredItem>();
  let nextId = 1;
  const upload = vi.fn(
    async (key: string, content: unknown, options?: { metadata?: unknown }) => {
      const id = items.get(key)?.id ?? `item-${nextId++}`;
      items.set(key, { id, key, content: String(content), metadata: options?.metadata });
      return { id, key, status: "queued" } as AiSearchItemInfo;
    },
  );
  const remove = vi.fn(async (itemId: string) => {
    const entry = [...items.values()].find((item) => item.id === itemId);
    if (!entry) {
      throw Object.assign(new Error("item_not_found"), {
        name: "AiSearchNotFoundError",
      });
    }
    items.delete(entry.key);
  });
  const instance = {
    search: vi.fn(),
    items: { upload, delete: remove },
  } as unknown as RecipeSearchInstance;
  return { instance, items, upload, remove };
}

async function seedUser(db: Db, id: string) {
  await db.insert(user).values({ id, name: id, email: `${id}@example.com` });
}

async function seedRecipe(db: Db, userId: string, id: string, title: string) {
  await db.insert(recipe).values({ id, userId, title });
  return id;
}

async function indexRow(db: Db, recipeId: string) {
  const [row] = await db
    .select()
    .from(recipeSearchIndex)
    .where(eq(recipeSearchIndex.recipeId, recipeId));
  return row;
}

let db: Db;
let fake: ReturnType<typeof createFakeInstance>;

beforeEach(async () => {
  db = createTestDb().db;
  fake = createFakeInstance();
  await seedUser(db, "u1");
  await seedUser(db, "u2");
});

describe("markRecipesDirty", () => {
  it("creates pending rows for known recipes and ignores unknown ids", async () => {
    await seedRecipe(db, "u1", "r1", "Soup");

    await markRecipesDirty(db, ["r1", "r1", "missing"]);

    expect(await indexRow(db, "r1")).toMatchObject({
      userId: "u1",
      status: "pending",
      attempts: 0,
    });
    expect(await indexRow(db, "missing")).toBeUndefined();
  });

  it("resets failed rows but keeps the last accepted item and hash", async () => {
    await seedRecipe(db, "u1", "r1", "Soup");
    await db.insert(recipeSearchIndex).values({
      recipeId: "r1",
      userId: "u1",
      itemId: "item-9",
      contentHash: "abc",
      status: "failed",
      attempts: 3,
      lastError: "boom",
    });

    await markRecipesDirty(db, ["r1"]);

    expect(await indexRow(db, "r1")).toMatchObject({
      itemId: "item-9",
      contentHash: "abc",
      status: "pending",
      attempts: 0,
      lastError: null,
    });
  });
});

describe("syncRecipes", () => {
  it("uploads the full recipe document with user-scoped metadata", async () => {
    await seedRecipe(db, "u1", "r1", "Tomato Soup");
    await db.insert(ingredient).values({
      id: "ing1",
      userId: "u1",
      name: "canned tomatoes",
      normalizedName: "canned tomatoes",
      costBasisUnit: "G",
    });
    await db.insert(recipeIngredient).values([
      { recipeId: "r1", ingredientId: "ing1", displayText: "cans tomatoes", rawText: "2 cans tomatoes", sortOrder: 0 },
      { recipeId: "r1", displayText: "basil", sortOrder: 1 },
    ]);
    await db.insert(recipeInstruction).values([
      { recipeId: "r1", sortOrder: 1, text: "Simmer" },
      { recipeId: "r1", sortOrder: 0, text: "Combine" },
    ]);
    await db.insert(tag).values({ id: "t1", userId: "u1", name: "soup" });
    await db.insert(recipeTag).values({ recipeId: "r1", tagId: "t1" });

    const summary = await syncRecipes({ db, instance: fake.instance }, ["r1"]);

    expect(summary).toEqual({ uploaded: 1, unchanged: 0, deleted: 0, failed: 0 });
    const stored = fake.items.get("users/u1/recipes/r1.md")!;
    expect(stored.metadata).toEqual({ user_id: "u1", recipe_id: "r1" });
    expect(stored.content).toContain("Tags: soup");
    expect(stored.content).toContain("- 2 cans tomatoes (canned tomatoes)\n- basil");
    expect(stored.content).toContain("1. Combine\n2. Simmer");
    expect(await indexRow(db, "r1")).toMatchObject({
      itemId: stored.id,
      status: "indexed",
      attempts: 0,
      contentHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("skips the upload when content is unchanged, even after marking dirty", async () => {
    await seedRecipe(db, "u1", "r1", "Soup");
    await syncRecipes({ db, instance: fake.instance }, ["r1"]);
    await markRecipesDirty(db, ["r1"]);

    const summary = await syncRecipes({ db, instance: fake.instance }, ["r1"]);

    expect(summary.unchanged).toBe(1);
    expect(fake.upload).toHaveBeenCalledTimes(1);
    expect((await indexRow(db, "r1"))?.status).toBe("indexed");
  });

  it("re-uploads changed content to the same key", async () => {
    await seedRecipe(db, "u1", "r1", "Soup");
    await syncRecipes({ db, instance: fake.instance }, ["r1"]);
    const before = await indexRow(db, "r1");
    await db.update(recipe).set({ title: "Better Soup" }).where(eq(recipe.id, "r1"));

    const summary = await syncRecipes({ db, instance: fake.instance }, ["r1"]);

    expect(summary.uploaded).toBe(1);
    const after = await indexRow(db, "r1");
    expect(after?.itemId).toBe(before?.itemId);
    expect(after?.contentHash).not.toBe(before?.contentHash);
    expect(fake.items.get("users/u1/recipes/r1.md")?.content).toContain("# Better Soup");
  });

  it("records failures without throwing and keeps the last accepted hash", async () => {
    await seedRecipe(db, "u1", "r1", "Soup");
    await syncRecipes({ db, instance: fake.instance }, ["r1"]);
    const before = await indexRow(db, "r1");
    await db.update(recipe).set({ title: "Changed" }).where(eq(recipe.id, "r1"));
    fake.upload.mockRejectedValueOnce(new Error("service unavailable"));

    const summary = await syncRecipes({ db, instance: fake.instance }, ["r1"]);

    expect(summary.failed).toBe(1);
    expect(await indexRow(db, "r1")).toMatchObject({
      status: "failed",
      attempts: 1,
      lastError: "service unavailable",
      itemId: before?.itemId,
      contentHash: before?.contentHash,
    });
  });

  it("deletes the remote item and row once the recipe is gone", async () => {
    await seedRecipe(db, "u1", "r1", "Soup");
    await syncRecipes({ db, instance: fake.instance }, ["r1"]);
    const { itemId } = (await indexRow(db, "r1"))!;
    await db.delete(recipe).where(eq(recipe.id, "r1"));

    const summary = await syncRecipes({ db, instance: fake.instance }, ["r1"]);

    expect(summary.deleted).toBe(1);
    expect(fake.remove).toHaveBeenCalledWith(itemId);
    expect(fake.items.size).toBe(0);
    expect(await indexRow(db, "r1")).toBeUndefined();
  });

  it("treats an already-missing remote item as deleted", async () => {
    await db.insert(recipeSearchIndex).values({
      recipeId: "gone",
      userId: "u1",
      itemId: "item-404",
      status: "indexed",
    });

    const summary = await syncRecipes({ db, instance: fake.instance }, ["gone"]);

    expect(summary.deleted).toBe(1);
    expect(await indexRow(db, "gone")).toBeUndefined();
  });
});

describe("findRecipesNeedingSync / syncPendingForUser", () => {
  it("returns missing, pending, retryable, and tombstoned rows for one user", async () => {
    await seedRecipe(db, "u1", "never", "Never indexed");
    await seedRecipe(db, "u1", "pending", "Pending");
    await seedRecipe(db, "u1", "retry", "Retry");
    await seedRecipe(db, "u1", "exhausted", "Exhausted");
    await seedRecipe(db, "u1", "done", "Done");
    await seedRecipe(db, "u2", "other", "Other user");
    await db.insert(recipeSearchIndex).values([
      { recipeId: "pending", userId: "u1", status: "pending" },
      { recipeId: "retry", userId: "u1", status: "failed", attempts: 1 },
      { recipeId: "exhausted", userId: "u1", status: "failed", attempts: MAX_SYNC_ATTEMPTS },
      { recipeId: "done", userId: "u1", status: "indexed", itemId: "i", contentHash: "h" },
      { recipeId: "tombstone", userId: "u1", status: "indexed", itemId: "i2" },
    ]);

    const ids = await findRecipesNeedingSync(db, "u1");

    expect(ids.sort()).toEqual(["never", "pending", "retry", "tombstone"]);
  });

  it("respects the batch limit", async () => {
    for (const id of ["a", "b", "c"]) await seedRecipe(db, "u1", id, id);

    const summary = await syncPendingForUser({ db, instance: fake.instance }, "u1", 2);

    expect(summary.uploaded).toBe(2);
    expect(await findRecipesNeedingSync(db, "u1")).toHaveLength(1);
  });
});

describe("dirty-marking lookups", () => {
  it("finds recipes by ingredient and by tag", async () => {
    await seedRecipe(db, "u1", "r1", "One");
    await seedRecipe(db, "u1", "r2", "Two");
    await db.insert(ingredient).values({
      id: "ing1",
      userId: "u1",
      name: "garlic",
      normalizedName: "garlic",
      costBasisUnit: "G",
    });
    await db.insert(recipeIngredient).values([
      { recipeId: "r1", ingredientId: "ing1", displayText: "garlic", sortOrder: 0 },
      { recipeId: "r1", ingredientId: "ing1", displayText: "more garlic", sortOrder: 1 },
    ]);
    await db.insert(tag).values({ id: "t1", userId: "u1", name: "quick" });
    await db.insert(recipeTag).values({ recipeId: "r2", tagId: "t1" });

    expect(await recipeIdsUsingIngredient(db, "ing1")).toEqual(["r1"]);
    expect(await recipeIdsWithTag(db, "t1")).toEqual(["r2"]);
  });
});

describe("reindexAll", () => {
  it("forces re-upload of unchanged recipes and reports what remains", async () => {
    await seedRecipe(db, "u1", "r1", "One");
    await seedRecipe(db, "u2", "r2", "Two");
    await syncRecipes({ db, instance: fake.instance }, ["r1", "r2"]);
    fake.upload.mockClear();

    const result = await reindexAll({ db, instance: fake.instance }, 1);

    expect(result).toMatchObject({ uploaded: 1, remaining: 1 });
    expect(fake.upload).toHaveBeenCalledTimes(1);
  });
});

describe("deleteUserSearchIndex", () => {
  it("removes only that user's items and rows", async () => {
    await seedRecipe(db, "u1", "r1", "Mine");
    await seedRecipe(db, "u2", "r2", "Theirs");
    await syncRecipes({ db, instance: fake.instance }, ["r1", "r2"]);

    const result = await deleteUserSearchIndex({ db, instance: fake.instance }, "u1");

    expect(result).toEqual({ deleted: 1, failed: 0 });
    expect([...fake.items.keys()]).toEqual(["users/u2/recipes/r2.md"]);
    expect(await indexRow(db, "r1")).toBeUndefined();
    expect(await indexRow(db, "r2")).toBeDefined();
  });
});

describe("getRecipeSearchInstance", () => {
  const get = vi.fn((name: string) => ({ name }));
  const env = (name: string) =>
    ({ AI_SEARCH: { get }, AI_SEARCH_INSTANCE: name }) as unknown as Pick<
      Env,
      "AI_SEARCH" | "AI_SEARCH_INSTANCE"
    >;

  it("returns the configured instance", () => {
    expect(getRecipeSearchInstance(env("quickpantry-recipes-dev"), true)).toEqual({
      name: "quickpantry-recipes-dev",
    });
    expect(getRecipeSearchInstance(env(PRODUCTION_SEARCH_INSTANCE), false)).toEqual({
      name: PRODUCTION_SEARCH_INSTANCE,
    });
  });

  it("refuses the production instance during local dev", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(getRecipeSearchInstance(env(PRODUCTION_SEARCH_INSTANCE), true)).toBeNull();
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  it("returns null when search is not configured", () => {
    expect(getRecipeSearchInstance(env(""), false)).toBeNull();
  });
});
