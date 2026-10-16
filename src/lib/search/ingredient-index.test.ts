import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  ingredient,
  ingredientAlias,
  ingredientSearchIndex,
  recipe,
  recipeIngredient,
  user,
  type Db,
} from "@/db";
import { createTestD1 } from "@/db/test-d1";
import { chunkRows } from "@/db/chunked-insert";
import { buildIngredientDocument, hashIngredientDocument, MAX_INGREDIENT_DOCUMENT_ALIASES, MAX_INGREDIENT_DOCUMENT_NOTES_LENGTH } from "./ingredient-document";
import {
  DEFAULT_INGREDIENT_SYNC_BATCH_SIZE,
  findIngredientsNeedingSync,
  getIngredientSearchInstance,
  ingredientRetryDelayMs,
  IngredientIndexTimeoutError,
  INGREDIENT_INDEX_IO_TIMEOUT_MS,
  INGREDIENT_RETRY_BASE_DELAY_MS,
  INGREDIENT_SYNC_BUDGET_MS,
  loadIngredientDocumentInputs,
  MAX_INGREDIENT_RETRY_DELAY_MS,
  MAX_INGREDIENT_SYNC_ATTEMPTS,
  PRODUCTION_INGREDIENT_SEARCH_INSTANCE,
  queueIngredientIndexSync,
  reindexIngredients,
  syncIngredients,
  syncNextIngredientBatch,
  syncPendingIngredientsForUser,
  type IngredientIndexDeps,
  type IngredientSearchEnv,
  type IngredientSearchInstance,
} from "./ingredient-index";

let runtime: Awaited<ReturnType<typeof createTestD1>>;
let db: Db;
let fake: ReturnType<typeof createFakeInstance>;

class FakeSearchError extends Error {
  constructor(message: string, public readonly code?: number) {
    super(message);
    this.name = "FakeSearchError";
  }
}

function createFakeInstance() {
  const items = new Map<string, { id: string; content: string; metadata?: Record<string, unknown> }>();
  let nextId = 1;
  const store: AiSearchItems["upload"] = async (key, content, options) => {
    if (typeof content !== "string") throw new FakeSearchError("Tests expect a string document");
    const id = items.get(key)?.id ?? `item-${nextId++}`;
    items.set(key, { id, content, metadata: options?.metadata });
    return { id, key, status: "queued" };
  };
  const deleteStored: AiSearchItems["delete"] = async (itemId) => {
    const entry = [...items.entries()].find(([, item]) => item.id === itemId);
    if (!entry) throw new FakeSearchError("item_not_found", 7041);
    items.delete(entry[0]);
  };
  const upload = vi.fn<AiSearchItems["upload"]>(store);
  const remove = vi.fn<AiSearchItems["delete"]>(deleteStored);
  const list = vi.fn<AiSearchItems["list"]>(async (params) => ({
    result: [...items.entries()].filter(([key]) => params?.key === key)
      .map(([key, item]) => ({ id: item.id, key, status: "queued", source_id: "builtin" })),
  }));
  const instance: IngredientSearchInstance = {
    search: vi.fn<AiSearchInstance["search"]>(async () => ({ search_query: "", chunks: [] })),
    items: { upload, delete: remove, list },
  };
  return { instance, items, upload, remove, list, store, deleteStored };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

function deps(waitUntil?: IngredientIndexDeps["waitUntil"]): IngredientIndexDeps {
  return { db, instance: fake.instance, waitUntil };
}

function searchEnv(name = "quickpantry-ingredients-dev"): IngredientSearchEnv {
  return { INGREDIENT_AI_SEARCH_INSTANCE: name, AI_SEARCH: { get: () => fake.instance } };
}

async function seedManyIngredients(count: number) {
  const rows = Array.from({ length: count }, (_, index) => ({
    id: `ingredient-${String(index).padStart(3, "0")}`, userId: "u1",
    name: `Ingredient ${index}`, normalizedName: `ingredient ${index}`, costBasisUnit: "G" as const,
  }));
  for (const chunk of chunkRows(rows, 10)) await db.insert(ingredient).values(chunk);
  return rows.map((row) => row.id);
}

async function seedIngredient(id: string, userId: string | null = "u1") {
  await db.insert(ingredient).values({ id, userId, name: id, normalizedName: id, costBasisUnit: "G" });
}

async function indexRow(id: string) {
  const [row] = await db.select().from(ingredientSearchIndex).where(eq(ingredientSearchIndex.ingredientId, id));
  return row;
}

beforeEach(async () => {
  runtime = await createTestD1();
  db = runtime.db;
  fake = createFakeInstance();
  await db.insert(user).values([
    { id: "u1", name: "One", email: "one@example.com" },
    { id: "u2", name: "Two", email: "two@example.com" },
  ]);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await runtime?.dispose();
});

describe("real-D1 ingredient search triggers", () => {
  it("records raw SQL inserts and searchable changes transactionally, retaining accepted state", async () => {
    await db.run(sql`INSERT INTO Ingredient (id, userId, name, normalizedName, costBasisUnit)
      VALUES ('tomato', 'u1', 'Tomato', 'tomato', 'G')`);
    expect(await indexRow("tomato")).toMatchObject({ scopeKey: "user:u1", version: 1, status: "pending" });
    await db.update(ingredientSearchIndex).set({
      itemId: "remote-tomato", contentHash: "accepted", status: "failed", attempts: 5,
      nextAttemptAt: new Date(Date.now() + 60_000), lastError: "unavailable",
    }).where(eq(ingredientSearchIndex.ingredientId, "tomato"));
    await db.run(sql`UPDATE Ingredient SET name = 'Canned tomato', category = 'Vegetables', notes = 'Use the juice.' WHERE id = 'tomato'`);
    expect(await indexRow("tomato")).toMatchObject({
      scopeKey: "user:u1", version: 2, status: "pending", attempts: 0,
      nextAttemptAt: null, lastError: null, itemId: "remote-tomato", contentHash: "accepted",
    });
    await db.run(sql`UPDATE Ingredient SET userId = NULL, normalizedName = 'canned tomato' WHERE id = 'tomato'`);
    expect(await indexRow("tomato")).toMatchObject({ scopeKey: "global", version: 3 });
  });

  it("does not dirty unchanged indexed fields or financial/conversion-only updates", async () => {
    await seedIngredient("garlic");
    const before = await indexRow("garlic");
    await db.run(sql`UPDATE Ingredient SET name = name, normalizedName = normalizedName, category = category, notes = notes WHERE id = 'garlic'`);
    await db.update(ingredient).set({
      costBasisUnit: "CUP", estimatedCentsPerBasisUnit: 150, gramsPerCup: 240,
      cupsPerEach: 0.5, conversionConfidence: "High", costConfidence: "High",
      defaultUnit: "CUP", preferredDisplayUnit: "CUP", subcategory: "Roots",
    }).where(eq(ingredient.id, "garlic"));
    expect(await indexRow("garlic")).toEqual(before);
  });

  it("marks alias insert/update/delete and both targets of a retarget", async () => {
    await seedIngredient("garlic");
    await seedIngredient("onion", null);
    await db.insert(ingredientAlias).values({ id: "a1", ingredientId: "garlic", aliasNormalized: "garlic cloves" });
    expect((await indexRow("garlic"))?.version).toBe(2);
    await db.run(sql`UPDATE IngredientAlias SET aliasNormalized = aliasNormalized WHERE id = 'a1'`);
    expect((await indexRow("garlic"))?.version).toBe(2);
    await db.update(ingredientAlias).set({ aliasNormalized: "cloves of garlic" }).where(eq(ingredientAlias.id, "a1"));
    expect((await indexRow("garlic"))?.version).toBe(3);
    await db.update(ingredientAlias).set({ ingredientId: "onion", aliasNormalized: "chopped onion" }).where(eq(ingredientAlias.id, "a1"));
    expect((await indexRow("garlic"))?.version).toBe(4);
    expect(await indexRow("onion")).toMatchObject({ version: 2, scopeKey: "global" });
    await db.delete(ingredientAlias).where(eq(ingredientAlias.id, "a1"));
    expect((await indexRow("onion"))?.version).toBe(3);
  });

  it("preserves remote item identity and owner scope after ingredient and alias cascade deletion", async () => {
    await seedIngredient("garlic");
    await db.insert(ingredientAlias).values({ id: "a1", ingredientId: "garlic", aliasNormalized: "garlic cloves" });
    await db.update(ingredientSearchIndex).set({ itemId: "remote-1", contentHash: "accepted", status: "indexed" }).where(eq(ingredientSearchIndex.ingredientId, "garlic"));
    const before = (await indexRow("garlic"))!;
    await db.delete(ingredient).where(eq(ingredient.id, "garlic"));
    expect(await db.select().from(ingredientAlias)).toEqual([]);
    expect(await indexRow("garlic")).toMatchObject({
      scopeKey: "user:u1", itemId: "remote-1", contentHash: "accepted", status: "pending", version: before.version + 1,
    });
  });

  it("tombstones an old ingredient key when raw SQL changes its primary key", async () => {
    await seedIngredient("old");
    await db.update(ingredientSearchIndex).set({ itemId: "remote-old" }).where(eq(ingredientSearchIndex.ingredientId, "old"));
    await db.run(sql`UPDATE Ingredient SET id = 'new' WHERE id = 'old'`);
    expect(await indexRow("old")).toMatchObject({ itemId: "remote-old", version: 2, status: "pending" });
    expect(await indexRow("new")).toMatchObject({ itemId: null, version: 1, status: "pending" });
  });

  it("rolls dirty state back when a later statement in the catalog write batch fails", async () => {
    await seedIngredient("garlic");
    const before = await indexRow("garlic");
    await expect(db.batch([
      db.update(ingredient).set({ name: "Changed" }).where(eq(ingredient.id, "garlic")),
      db.insert(ingredientAlias).values({ id: "invalid", ingredientId: "missing", aliasNormalized: "bad alias" }),
    ])).rejects.toThrow();
    expect(await indexRow("garlic")).toEqual(before);
    expect((await db.select().from(ingredient).where(eq(ingredient.id, "garlic")))[0].name).toBe("garlic");
  });

  it("rolls account cleanup and its tombstones back with a failed transaction", async () => {
    await seedIngredient("one");
    await db.insert(ingredientAlias).values({ id: "alias", ingredientId: "one", aliasNormalized: "one alias" });
    await db.insert(recipe).values({ id: "owned", userId: "u1", title: "Owned" });
    await db.insert(recipeIngredient).values({ id: "owned-link", recipeId: "owned", ingredientId: "one", displayText: "Original text", sortOrder: 0 });
    const before = await indexRow("one");
    await expect(db.batch([
      db.delete(user).where(eq(user.id, "u1")),
      db.insert(ingredientAlias).values({ id: "bad", ingredientId: "missing", aliasNormalized: "invalid" }),
    ])).rejects.toThrow();
    expect(await indexRow("one")).toEqual(before);
    expect(await db.select().from(ingredientAlias)).toMatchObject([{ id: "alias" }]);
    expect(await db.select().from(recipeIngredient)).toMatchObject([{ ingredientId: "one", displayText: "Original text" }]);
    expect(await db.select().from(user).where(eq(user.id, "u1"))).toHaveLength(1);
  });

  it("deletes private ingredients on account deletion without promoting them or changing surviving recipe text", async () => {
    await seedIngredient("private");
    await seedIngredient("global", null);
    await seedIngredient("other", "u2");
    await db.insert(ingredientAlias).values([
      { id: "private-alias", ingredientId: "private", aliasNormalized: "private alias" },
      { id: "global-alias", ingredientId: "global", aliasNormalized: "global alias" },
    ]);
    await db.insert(recipe).values([
      { id: "owned", userId: "u1", title: "Owned recipe" },
      { id: "survivor", userId: "u2", title: "Surviving recipe" },
    ]);
    await db.insert(recipeIngredient).values([
      { id: "owned-link", recipeId: "owned", ingredientId: "private", displayText: "private ingredient", sortOrder: 0 },
      { id: "surviving-link", recipeId: "survivor", ingredientId: "private", displayText: "display stays", rawText: "2 cups raw stays", sortOrder: 0 },
      { id: "global-link", recipeId: "survivor", ingredientId: "global", displayText: "global ingredient", sortOrder: 1 },
    ]);
    await db.update(ingredientSearchIndex).set({ itemId: "remote-private", status: "indexed" }).where(eq(ingredientSearchIndex.ingredientId, "private"));

    await db.delete(user).where(eq(user.id, "u1"));

    expect((await db.select().from(ingredient)).map((row) => row.id).sort()).toEqual(["global", "other"]);
    expect((await db.select().from(ingredientAlias)).map((row) => row.id)).toEqual(["global-alias"]);
    expect((await db.select().from(recipe)).map((row) => row.id)).toEqual(["survivor"]);
    expect(await db.select().from(recipeIngredient).where(eq(recipeIngredient.id, "surviving-link"))).toMatchObject([
      { ingredientId: null, displayText: "display stays", rawText: "2 cups raw stays" },
    ]);
    expect(await indexRow("private")).toMatchObject({ scopeKey: "user:u1", itemId: "remote-private", status: "pending" });
    expect(await indexRow("global")).toMatchObject({ scopeKey: "global" });
  });

  it("adds the migration to an existing catalog without deleting aliases or eagerly backfilling", async () => {
    const existing = await createTestD1(async (filename, existingDb) => {
      if (filename !== "0004_ingredient_search_index.sql") return;
      await existingDb.insert(user).values({ id: "existing", name: "Existing", email: "existing@example.com" });
      await existingDb.insert(ingredient).values({ id: "existing", userId: "existing", name: "Existing", normalizedName: "existing", costBasisUnit: "G" });
      await existingDb.insert(ingredientAlias).values({ id: "existing-alias", ingredientId: "existing", aliasNormalized: "existing alias" });
    });
    try {
      expect(await existing.db.select().from(ingredientAlias)).toMatchObject([{ id: "existing-alias" }]);
      expect(await existing.db.select().from(ingredientSearchIndex)).toEqual([]);
      expect(await existing.db.all(sql`PRAGMA foreign_key_list(IngredientSearchIndex)`)).toEqual([]);
    } finally {
      await existing.dispose();
    }
  });
});

describe("ingredient documents loaded from D1", () => {
  it("loads only indexed fields, with sorted bounded aliases/notes and complete canonical names", async () => {
    const name = "n".repeat(500);
    await db.insert(ingredient).values({
      id: "one", userId: "u1", name, normalizedName: name, costBasisUnit: "CUP",
      estimatedCentsPerBasisUnit: 1234, gramsPerCup: 200, category: "Vegetables",
      notes: ` ${"z".repeat(2_000)} `,
    });
    for (let index = 30; index >= 0; index--) {
      await db.insert(ingredientAlias).values({ ingredientId: "one", aliasNormalized: `alias-${String(index).padStart(2, "0")}` });
    }
    await db.insert(ingredientAlias).values([
      { ingredientId: "one", aliasNormalized: " alias-00 " },
      { ingredientId: "one", aliasNormalized: " " },
      { ingredientId: "one", aliasNormalized: "x".repeat(1_000) },
    ]);

    const inputs = await loadIngredientDocumentInputs(db, ["one", "one", "missing"]);

    expect(inputs.size).toBe(1);
    expect(inputs.get("one")).toEqual({
      id: "one", userId: "u1", name, normalizedName: name, category: "Vegetables",
      notes: "z".repeat(MAX_INGREDIENT_DOCUMENT_NOTES_LENGTH),
      aliases: Array.from({ length: MAX_INGREDIENT_DOCUMENT_ALIASES }, (_, index) => `alias-${String(index).padStart(2, "0")}`),
    });
  });

  it("chunks document reads below D1's variable limit for more than 100 IDs", async () => {
    const ids = await seedManyIngredients(111);
    const inputs = await loadIngredientDocumentInputs(db, [...ids, ...ids, "missing"]);
    expect(inputs.size).toBe(111);
    expect(inputs.get(ids[110])).toMatchObject({ name: "Ingredient 110", aliases: [] });
  });

  it.each(["name", "normalizedName"] as const)("bounds a raw 100,000-character %s read and fails retryably instead of uploading a truncated identity", async (field) => {
    const valid = "n".repeat(500);
    const oversized = "private-name-" + "x".repeat(100_000 - "private-name-".length);
    const name = field === "name" ? oversized : valid;
    const normalizedName = field === "normalizedName" ? oversized : valid;
    await db.run(sql`INSERT INTO Ingredient (id, userId, name, normalizedName, costBasisUnit)
      VALUES ('oversized', 'u1', ${name}, ${normalizedName}, 'G')`);

    const input = (await loadIngredientDocumentInputs(db, ["oversized"])).get("oversized")!;
    expect(input[field]).toHaveLength(501);
    expect(input[field === "name" ? "normalizedName" : "name"]).toBe(valid);
    expect(await syncIngredients(deps(), ["oversized"])).toMatchObject({ failed: 1, uploaded: 0 });
    expect(fake.upload).not.toHaveBeenCalled();
    expect(fake.items.size).toBe(0);
    const failed = (await indexRow("oversized"))!;
    expect(failed).toMatchObject({ status: "failed", attempts: 1, contentHash: null });
    expect(failed.lastError).toContain(`${field} length 501`);
    expect(failed.lastError).not.toContain("private-name-");
    expect(await findIngredientsNeedingSync(db, "u1", 20, failed.nextAttemptAt!.getTime())).toEqual(["oversized"]);

    await db.run(sql`UPDATE Ingredient SET name = ${valid}, normalizedName = ${valid} WHERE id = 'oversized'`);
    expect(await syncIngredients(deps(), ["oversized"])).toMatchObject({ uploaded: 1 });
    expect(fake.items.get("ingredients/oversized.md")?.content).toBe(`# ${valid}\n\nNormalized name: ${valid}\n`);
    expect((await indexRow("oversized"))?.status).toBe("indexed");
  });
});

describe("syncIngredients", () => {
  it("uploads stable keys with global/private metadata and an accepted-content hash", async () => {
    await seedIngredient("global", null);
    await seedIngredient("mine");
    await db.insert(ingredientAlias).values({ ingredientId: "mine", aliasNormalized: "my alias" });
    await db.update(ingredient).set({ category: "Vegetables", notes: "Use fresh." }).where(eq(ingredient.id, "mine"));

    const summary = await syncIngredients(deps(), ["global", "mine", "mine", "missing"]);

    expect(summary).toEqual({ uploaded: 2, unchanged: 0, deleted: 0, failed: 0 });
    expect(fake.items.get("ingredients/global.md")?.metadata).toEqual({ ingredient_id: "global", scope_key: "global" });
    expect(fake.items.get("ingredients/mine.md")).toMatchObject({
      metadata: { ingredient_id: "mine", scope_key: "user:u1" },
      content: expect.stringContaining("## Aliases\n- my alias"),
    });
    expect(fake.items.get("ingredients/mine.md")?.content).toContain("Category: Vegetables");
    const input = (await loadIngredientDocumentInputs(db, ["mine"])).get("mine")!;
    expect(await indexRow("mine")).toMatchObject({
      status: "indexed", itemId: fake.items.get("ingredients/mine.md")?.id,
      contentHash: await hashIngredientDocument(buildIngredientDocument(input)), attempts: 0, nextAttemptAt: null,
    });
    expect((await indexRow("mine"))?.indexedAt).toBeInstanceOf(Date);
    expect(await indexRow("missing")).toBeUndefined();
  });

  it("skips unchanged hashes after edits return to the same document and aliases deduplicate", async () => {
    await seedIngredient("garlic");
    await db.insert(ingredientAlias).values({ ingredientId: "garlic", aliasNormalized: "garlic clove" });
    await syncIngredients(deps(), ["garlic"]);
    const before = (await indexRow("garlic"))!;
    await db.update(ingredient).set({ name: "Changed" }).where(eq(ingredient.id, "garlic"));
    await db.update(ingredient).set({ name: "garlic" }).where(eq(ingredient.id, "garlic"));
    await db.insert(ingredientAlias).values({ ingredientId: "garlic", aliasNormalized: " garlic clove " });

    expect(await syncIngredients(deps(), ["garlic"])).toMatchObject({ unchanged: 1, uploaded: 0 });
    expect(fake.upload).toHaveBeenCalledTimes(1);
    expect(await indexRow("garlic")).toMatchObject({ status: "indexed", contentHash: before.contentHash, version: before.version + 3 });
  });

  it("refreshes both documents after an alias retarget and updates scope metadata after ownership changes", async () => {
    await seedIngredient("one");
    await seedIngredient("two", null);
    await db.insert(ingredientAlias).values({ id: "alias", ingredientId: "one", aliasNormalized: "shared alias" });
    await syncIngredients(deps(), ["one", "two"]);
    await db.update(ingredientAlias).set({ ingredientId: "two" }).where(eq(ingredientAlias.id, "alias"));
    await db.update(ingredient).set({ userId: "u2" }).where(eq(ingredient.id, "one"));

    expect(await syncIngredients(deps(), ["one", "two"])).toMatchObject({ uploaded: 2 });
    expect(fake.items.get("ingredients/one.md")?.content).not.toContain("shared alias");
    expect(fake.items.get("ingredients/one.md")?.metadata).toEqual({ ingredient_id: "one", scope_key: "user:u2" });
    expect(fake.items.get("ingredients/two.md")?.content).toContain("shared alias");
  });

  it("retains the last accepted item, clears its hash on failure, and respects retry backoff", async () => {
    await seedIngredient("garlic");
    await syncIngredients(deps(), ["garlic"]);
    const before = (await indexRow("garlic"))!;
    await db.update(ingredient).set({ notes: "Changed" }).where(eq(ingredient.id, "garlic"));
    fake.upload.mockRejectedValueOnce(new FakeSearchError("service unavailable"));
    const start = Date.now();

    expect(await syncIngredients(deps(), ["garlic"])).toMatchObject({ failed: 1 });
    const row = (await indexRow("garlic"))!;
    expect(row).toMatchObject({ status: "failed", attempts: 1, itemId: before.itemId, contentHash: null, lastError: "service unavailable" });
    expect(row.nextAttemptAt!.getTime()).toBeGreaterThanOrEqual(start + INGREDIENT_RETRY_BASE_DELAY_MS);
    expect(await findIngredientsNeedingSync(db, "u1")).toEqual([]);
    expect(await syncIngredients(deps(), ["garlic"])).toMatchObject({ uploaded: 0, failed: 0 });
    expect(await findIngredientsNeedingSync(db, "u1", 20, row.nextAttemptAt!.getTime())).toEqual(["garlic"]);
    vi.spyOn(Date, "now").mockReturnValue(row.nextAttemptAt!.getTime());
    expect(await syncPendingIngredientsForUser(deps(), "u1")).toMatchObject({ uploaded: 1 });
  });

  it("reuploads reverted content after a current upload mutates remote content then rejects", async () => {
    await seedIngredient("one");
    await syncIngredients(deps(), ["one"]);
    const original = fake.items.get("ingredients/one.md")!;
    await db.update(ingredient).set({ name: "Changed" }).where(eq(ingredient.id, "one"));
    fake.upload.mockImplementationOnce(async (...args) => {
      await fake.store(...args);
      throw new FakeSearchError("response lost after acceptance");
    });
    expect(await syncIngredients(deps(), ["one"])).toMatchObject({ failed: 1 });
    const uncertain = (await indexRow("one"))!;
    expect(fake.items.get("ingredients/one.md")?.content).toContain("# Changed");

    await db.update(ingredient).set({ name: "one" }).where(eq(ingredient.id, "one"));
    expect(await syncIngredients(deps(), ["one"])).toMatchObject({ uploaded: 1, unchanged: 0 });
    expect(uncertain).toMatchObject({ status: "failed", attempts: 1, itemId: original.id, contentHash: null });
    expect(fake.items.get("ingredients/one.md")).toEqual(original);
    expect((await indexRow("one"))?.status).toBe("indexed");
  });

  it("bounds explicit syncs and leaves the rest discoverable", async () => {
    const ids = await seedManyIngredients(45);
    expect(await syncIngredients(deps(), [...ids, ...ids])).toMatchObject({ uploaded: DEFAULT_INGREDIENT_SYNC_BATCH_SIZE });
    expect(fake.upload).toHaveBeenCalledTimes(DEFAULT_INGREDIENT_SYNC_BATCH_SIZE);
    expect(await syncNextIngredientBatch(deps())).toMatchObject({ uploaded: DEFAULT_INGREDIENT_SYNC_BATCH_SIZE, remaining: 5 });
  });

  it("stops starting new I/O after the finite sync budget", async () => {
    await seedManyIngredients(3);
    const start = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(start);
    const background: Promise<unknown>[] = [];
    fake.upload.mockImplementationOnce(async (...args) => {
      const result = await fake.store(...args);
      now.mockReturnValue(start + INGREDIENT_SYNC_BUDGET_MS);
      return result;
    });
    expect(await syncPendingIngredientsForUser(deps((promise) => { background.push(promise); }), "u1")).toMatchObject({ failed: 1 });
    await Promise.all(background);
    expect(fake.upload).toHaveBeenCalledTimes(1);
    expect(await findIngredientsNeedingSync(db, "u1")).toHaveLength(3);
  });

  it.each(["current", "obsolete"])("starts no remote or D1 I/O after a lookup crosses the deadline when the saved item ID is %s", async (identity) => {
    await seedIngredient("one");
    await syncIngredients(deps(), ["one"]);
    await db.delete(ingredient).where(eq(ingredient.id, "one"));
    if (identity === "obsolete") {
      await db.update(ingredientSearchIndex).set({ itemId: "obsolete" }).where(eq(ingredientSearchIndex.ingredientId, "one"));
    }
    const before = (await indexRow("one"))!;
    const start = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(start);
    const d1 = [vi.spyOn(db, "run"), vi.spyOn(db, "all"), vi.spyOn(db, "update"), vi.spyOn(db, "delete"), vi.spyOn(db, "batch")];
    let callsAtDeadline: number[] = [];
    fake.list.mockImplementationOnce(async () => {
      now.mockReturnValue(start + INGREDIENT_SYNC_BUDGET_MS + 1);
      callsAtDeadline = d1.map((method) => method.mock.calls.length);
      return { result: [{ id: fake.items.get("ingredients/one.md")!.id, key: "ingredients/one.md", status: "queued" }] };
    });

    await syncIngredients(deps(), ["one"]);
    expect(fake.remove).not.toHaveBeenCalled();
    expect(d1.map((method) => method.mock.calls.length)).toEqual(callsAtDeadline);
    expect(await indexRow("one")).toEqual(before);
    expect(fake.items.size).toBe(1);
    expect(await syncPendingIngredientsForUser(deps(), "u2")).toMatchObject({ deleted: 1 });
    expect(fake.items.size).toBe(0);
    expect(await indexRow("one")).toBeUndefined();
  });

  it.each(["accepts", "rejects"])("persists uncertainty before an upload that %s after the shared deadline and repairs a revert", async (outcome) => {
    await seedIngredient("one");
    await syncIngredients(deps(), ["one"]);
    const original = fake.items.get("ingredients/one.md")!;
    await db.update(ingredient).set({ name: "Changed" }).where(eq(ingredient.id, "one"));
    const start = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(start);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const background: Promise<unknown>[] = [];
    let hashBeforeMutation: string | null | undefined;
    fake.upload.mockImplementationOnce(async (...args) => {
      hashBeforeMutation = (await indexRow("one"))?.contentHash;
      now.mockReturnValue(start + INGREDIENT_SYNC_BUDGET_MS + 1);
      const result = await fake.store(...args);
      if (outcome === "rejects") throw new FakeSearchError("response lost after acceptance");
      return result;
    });

    await syncIngredients(deps((promise) => { background.push(promise); }), ["one"]);
    await Promise.all(background);
    expect(hashBeforeMutation).toBeNull();
    expect(fake.items.get("ingredients/one.md")?.content).toContain("# Changed");
    expect((await indexRow("one"))?.contentHash).toBeNull();
    await db.update(ingredient).set({ name: "one" }).where(eq(ingredient.id, "one"));
    expect(await syncIngredients(deps(), ["one"])).toMatchObject({ uploaded: 1, unchanged: 0 });
    expect(fake.items.get("ingredients/one.md")).toEqual(original);
    expect((await indexRow("one"))?.status).toBe("indexed");
  });

  it.each(["accepts", "rejects"])("retains a dirty tombstone when a delete %s after the shared deadline", async (outcome) => {
    await seedIngredient("one");
    await syncIngredients(deps(), ["one"]);
    await db.delete(ingredient).where(eq(ingredient.id, "one"));
    const start = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(start);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const background: Promise<unknown>[] = [];
    let hashBeforeMutation: string | null | undefined;
    fake.remove.mockImplementationOnce(async (id) => {
      hashBeforeMutation = (await indexRow("one"))?.contentHash;
      now.mockReturnValue(start + INGREDIENT_SYNC_BUDGET_MS + 1);
      await fake.deleteStored(id);
      if (outcome === "rejects") throw new FakeSearchError("response lost after deletion");
    });

    await syncIngredients(deps((promise) => { background.push(promise); }), ["one"]);
    await Promise.all(background);
    expect(hashBeforeMutation).toBeNull();
    expect(fake.remove).toHaveBeenCalledTimes(1);
    expect(fake.items.size).toBe(0);
    const retained = (await indexRow("one"))!;
    expect(retained).toMatchObject({ scopeKey: "user:u1", contentHash: null, itemId: expect.any(String) });
    now.mockReturnValue(retained.nextAttemptAt?.getTime() ?? Date.now());
    expect(await syncPendingIngredientsForUser(deps(), "u2")).toMatchObject({ deleted: 1 });
    expect(await indexRow("one")).toBeUndefined();
  });

  it("clamps a delete timeout to the remaining remote window and persists its retry state", async () => {
    await seedIngredient("one");
    await syncIngredients(deps(), ["one"]);
    await db.delete(ingredient).where(eq(ingredient.id, "one"));
    const start = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(start);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const background: Promise<unknown>[] = [];
    const started = deferred<void>();
    const release = deferred<void>();
    fake.list.mockImplementationOnce(async () => {
      now.mockReturnValue(start + INGREDIENT_SYNC_BUDGET_MS - INGREDIENT_INDEX_IO_TIMEOUT_MS - 50);
      return { result: [{ id: fake.items.get("ingredients/one.md")!.id, key: "ingredients/one.md", status: "queued" }] };
    });
    fake.remove.mockImplementationOnce(async (id) => {
      started.resolve();
      await release.promise;
      await fake.deleteStored(id);
      throw new FakeSearchError("late response lost after deletion");
    });
    const pending = syncIngredients(deps((promise) => { background.push(promise); }), ["one"]);
    await started.promise;
    expect(await pending).toMatchObject({ failed: 1 });
    const timedOut = (await indexRow("one"))!;
    expect(timedOut).toMatchObject({
      status: "failed", contentHash: null, attempts: 1,
      lastError: "Ingredient index delete timed out after 50ms: one",
    });
    release.resolve();
    await Promise.all(background);
    expect(await indexRow("one")).toEqual(timedOut);
    now.mockReturnValue(timedOut.nextAttemptAt!.getTime());
    expect(await syncPendingIngredientsForUser(deps(), "u2")).toMatchObject({ deleted: 1 });
    expect(await indexRow("one")).toBeUndefined();
  });
});

describe("backfill, scoping, and durable deletion retries", () => {
  it("discovers missing/pending global and current-user live rows plus every orphan, excluding other private rows", async () => {
    await seedIngredient("global", null);
    await seedIngredient("mine");
    await seedIngredient("other", "u2");
    await seedIngredient("orphan", "u2");
    await syncIngredients(deps(), ["orphan"]);
    await db.delete(ingredient).where(eq(ingredient.id, "orphan"));
    await db.delete(ingredientSearchIndex).where(eq(ingredientSearchIndex.ingredientId, "mine"));
    await db.delete(ingredientSearchIndex).where(eq(ingredientSearchIndex.ingredientId, "other"));
    fake.upload.mockClear();

    expect((await findIngredientsNeedingSync(db, "u1")).sort()).toEqual(["global", "mine", "orphan"]);
    expect(await syncPendingIngredientsForUser(deps(), "u1")).toEqual({ uploaded: 2, unchanged: 0, deleted: 1, failed: 0 });
    expect(fake.upload.mock.calls.map(([key]) => key).sort()).toEqual(["ingredients/global.md", "ingredients/mine.md"]);
    expect(await indexRow("other")).toBeUndefined();
    expect(await findIngredientsNeedingSync(db, "u1")).toEqual([]);
    expect(await findIngredientsNeedingSync(db, "u2")).toEqual(["other"]);
  });

  it("discovers pre-migration entries lazily and only backfills one bounded batch", async () => {
    const existing = await createTestD1(async (filename, existingDb) => {
      if (filename !== "0004_ingredient_search_index.sql") return;
      await existingDb.insert(user).values({ id: "existing", name: "Existing", email: "existing@example.com" });
      for (let index = 0; index < 25; index++) {
        await existingDb.insert(ingredient).values({ id: `old-${index}`, userId: "existing", name: `Old ${index}`, normalizedName: `old ${index}`, costBasisUnit: "G" });
      }
    });
    try {
      expect(await syncPendingIngredientsForUser({ db: existing.db, instance: fake.instance }, "existing", 2)).toMatchObject({ uploaded: 2 });
      expect(await existing.db.select().from(ingredientSearchIndex)).toHaveLength(2);
      expect(await syncNextIngredientBatch({ db: existing.db, instance: fake.instance }, 1)).toMatchObject({ uploaded: 1, remaining: 22 });
    } finally {
      await existing.dispose();
    }
  });

  it("retries failed deletion beyond the live-row maximum even after its owner is deleted", async () => {
    await seedIngredient("private");
    await syncIngredients(deps(), ["private"]);
    await db.delete(user).where(eq(user.id, "u1"));
    fake.remove.mockRejectedValue(new FakeSearchError("delete unavailable"));
    const now = vi.spyOn(Date, "now");
    for (let attempt = 1; attempt <= MAX_INGREDIENT_SYNC_ATTEMPTS + 2; attempt++) {
      expect(await syncPendingIngredientsForUser(deps(), "u2")).toMatchObject({ failed: 1 });
      const row = (await indexRow("private"))!;
      expect(row).toMatchObject({ attempts: attempt, scopeKey: "user:u1", status: "failed" });
      expect(row.nextAttemptAt!.getTime() - Date.now()).toBeLessThanOrEqual(MAX_INGREDIENT_RETRY_DELAY_MS);
      expect(await findIngredientsNeedingSync(db, "u2")).toEqual([]);
      now.mockReturnValue(row.nextAttemptAt!.getTime());
      expect(await findIngredientsNeedingSync(db, "u2")).toEqual(["private"]);
    }
    fake.remove.mockImplementation(fake.deleteStored);
    expect(await syncNextIngredientBatch(deps())).toMatchObject({ deleted: 1, remaining: 0 });
    expect(fake.items.size).toBe(0);
    expect(await indexRow("private")).toBeUndefined();
  });

  it("does not drop a tombstone when the missing resource is the instance rather than the item", async () => {
    await db.insert(ingredientSearchIndex).values({ ingredientId: "gone", scopeKey: "user:deleted", itemId: "remote", attempts: 9 });
    fake.remove.mockRejectedValueOnce(Object.assign(new FakeSearchError("AI Search instance not found", 7002), { name: "AiSearchNotFoundError" }));
    expect(await syncPendingIngredientsForUser(deps(), "u2")).toMatchObject({ failed: 1, deleted: 0 });
    expect(await indexRow("gone")).toMatchObject({ attempts: 10, itemId: "remote", status: "failed" });
  });

  it("recovers an accepted remote upload whose response was lost before the item ID was recorded", async () => {
    await seedIngredient("one");
    fake.upload.mockImplementationOnce(async (...args) => {
      await fake.store(...args);
      throw new FakeSearchError("response lost after acceptance");
    });
    await syncIngredients(deps(), ["one"]);
    expect(await indexRow("one")).toMatchObject({ status: "failed", itemId: null });
    await db.delete(ingredient).where(eq(ingredient.id, "one"));
    expect(await syncPendingIngredientsForUser(deps(), "u2")).toMatchObject({ deleted: 1 });
    expect(fake.list).toHaveBeenCalledWith({ key: "ingredients/one.md", source: "builtin", per_page: 1 });
    expect(fake.items.size).toBe(0);
    expect(await indexRow("one")).toBeUndefined();
  });

  it("persists a corrected remote ID before a deletion failure and retains it for retry", async () => {
    await db.insert(ingredientSearchIndex).values({ ingredientId: "one", scopeKey: "user:deleted", itemId: "obsolete", version: 4 });
    const current = await fake.store("ingredients/one.md", "# Previously accepted");
    fake.remove.mockRejectedValueOnce(new FakeSearchError("delete unavailable"));
    expect(await syncIngredients(deps(), ["one"])).toMatchObject({ failed: 1 });
    expect(await indexRow("one")).toMatchObject({ itemId: current.id, version: 6, status: "failed", attempts: 1, scopeKey: "user:deleted" });
  });

  it("retains the tombstone on failed or unexpected exact-key lookups", async () => {
    await db.insert(ingredientSearchIndex).values({ ingredientId: "one", scopeKey: "global", itemId: "remote", version: 4 });
    fake.list.mockRejectedValueOnce(new FakeSearchError("lookup unavailable"));
    expect(await syncIngredients(deps(), ["one"])).toMatchObject({ failed: 1 });
    expect(fake.remove).not.toHaveBeenCalled();
    const retryAt = (await indexRow("one"))!.nextAttemptAt!.getTime();
    vi.spyOn(Date, "now").mockReturnValue(retryAt);
    fake.list.mockResolvedValueOnce({ result: [{ id: "wrong", key: "ingredients/another.md", status: "queued" }] });
    expect(await syncIngredients(deps(), ["one"])).toMatchObject({ failed: 1 });
    expect(await indexRow("one")).toMatchObject({ itemId: "remote", attempts: 2, lastError: "Ingredient index lookup returned unexpected items: one" });
    expect(fake.remove).not.toHaveBeenCalled();
  });

  it("does not adopt or delete a lookup result after its ingredient is recreated", async () => {
    await db.insert(ingredientSearchIndex).values({ ingredientId: "one", scopeKey: "user:u1", itemId: "obsolete", version: 4 });
    const current = await fake.store("ingredients/one.md", "# Previous");
    const started = deferred<void>();
    const release = deferred<void>();
    fake.list.mockImplementationOnce(async () => {
      started.resolve();
      await release.promise;
      return { result: [current] };
    });
    const older = syncIngredients(deps(), ["one"]);
    await started.promise;
    await seedIngredient("one");
    await syncIngredients(deps(), ["one"]);
    const before = await indexRow("one");
    release.resolve();
    await older;
    expect(await indexRow("one")).toEqual(before);
    expect(fake.remove).not.toHaveBeenCalled();
    expect(fake.items.get("ingredients/one.md")?.content).toContain("# one");
  });

  it("removes only current tombstones after a successful or known item-not-found delete", async () => {
    await seedIngredient("gone");
    await syncIngredients(deps(), ["gone"]);
    await db.delete(ingredient).where(eq(ingredient.id, "gone"));
    await db.insert(ingredientSearchIndex).values({ ingredientId: "already-gone", scopeKey: "global", itemId: "not-present", version: 7 });
    expect(await syncIngredients(deps(), ["gone", "already-gone"])).toMatchObject({ deleted: 2 });
    expect(await db.select().from(ingredientSearchIndex)).toEqual([]);
    expect(fake.remove).toHaveBeenCalledTimes(2);
  });

  it("caps upload attempts, then an admin reindex restarts failures, tombstones, and unchanged live rows", async () => {
    await seedIngredient("exhausted");
    await seedIngredient("indexed", null);
    await seedIngredient("gone", "u2");
    await syncIngredients(deps(), ["indexed", "gone"]);
    await db.delete(ingredient).where(eq(ingredient.id, "gone"));
    const now = vi.spyOn(Date, "now");
    fake.upload.mockRejectedValue(new FakeSearchError("x".repeat(1_000)));
    for (let attempt = 1; attempt <= MAX_INGREDIENT_SYNC_ATTEMPTS; attempt++) {
      expect(await syncIngredients(deps(), ["exhausted"])).toMatchObject({ failed: 1 });
      const row = (await indexRow("exhausted"))!;
      expect(row.lastError).toHaveLength(500);
      now.mockReturnValue(row.nextAttemptAt!.getTime());
    }
    expect(await syncIngredients(deps(), ["exhausted"])).toMatchObject({ failed: 0, uploaded: 0 });
    expect(await findIngredientsNeedingSync(db, "u1")).not.toContain("exhausted");
    await db.update(ingredientSearchIndex).set({ status: "failed", attempts: 12, nextAttemptAt: new Date(Date.now() + 86_400_000) }).where(eq(ingredientSearchIndex.ingredientId, "gone"));
    fake.upload.mockImplementation(fake.store);
    fake.upload.mockClear();

    expect(await reindexIngredients(deps(), 1)).toMatchObject({ deleted: 1, remaining: 2 });
    expect(await indexRow("exhausted")).toMatchObject({ status: "pending", attempts: 0, nextAttemptAt: null });
    expect(await indexRow("indexed")).toMatchObject({ status: "pending", contentHash: null });
    expect(await syncNextIngredientBatch(deps())).toMatchObject({ uploaded: 2, remaining: 0 });
    expect(fake.upload).toHaveBeenCalledTimes(2);
  });

  it("bounds discovery limits and reports backed-off work as remaining", async () => {
    await seedManyIngredients(30);
    expect(await findIngredientsNeedingSync(db, "u1", 10_000)).toHaveLength(DEFAULT_INGREDIENT_SYNC_BATCH_SIZE);
    expect(await findIngredientsNeedingSync(db, "u1", -1)).toEqual([]);
    expect(await syncNextIngredientBatch(deps(), 0)).toMatchObject({ uploaded: 0, remaining: 30 });
    fake.upload.mockRejectedValueOnce(new FakeSearchError("unavailable"));
    expect(await syncNextIngredientBatch(deps(), 1)).toMatchObject({ failed: 1, remaining: 30 });
  });
});

describe("ingredient synchronization races", () => {
  it("invalidates out-of-order uploads and repairs the actual remote content", async () => {
    await seedIngredient("one");
    const started = deferred<void>();
    const release = deferred<void>();
    fake.upload.mockImplementationOnce(async (...args) => { started.resolve(); await release.promise; return fake.store(...args); });
    const older = syncIngredients(deps(), ["one"]);
    await started.promise;
    await db.update(ingredient).set({ name: "Newer name" }).where(eq(ingredient.id, "one"));
    await syncIngredients(deps(), ["one"]);
    release.resolve();
    await older;

    expect(fake.items.get("ingredients/one.md")?.content).toContain("# one");
    expect(await indexRow("one")).toMatchObject({ status: "pending", contentHash: null });
    await syncIngredients(deps(), ["one"]);
    expect(fake.items.get("ingredients/one.md")?.content).toContain("# Newer name");
    expect((await indexRow("one"))?.status).toBe("indexed");
  });

  it("invalidates newer indexed content when an older upload changes remote content then rejects", async () => {
    await seedIngredient("one");
    const started = deferred<void>();
    const release = deferred<void>();
    fake.upload.mockImplementationOnce(async (...args) => {
      started.resolve();
      await release.promise;
      await fake.store(...args);
      throw new FakeSearchError("response lost after acceptance");
    });
    const older = syncIngredients(deps(), ["one"]);
    await started.promise;
    await db.update(ingredient).set({ name: "Newer name", userId: "u2" }).where(eq(ingredient.id, "one"));
    const document = buildIngredientDocument((await loadIngredientDocumentInputs(db, ["one"])).get("one")!);
    expect(await syncIngredients(deps(), ["one"])).toMatchObject({ uploaded: 1 });
    const before = (await indexRow("one"))!;
    expect(before).toMatchObject({ status: "indexed", contentHash: await hashIngredientDocument(document), scopeKey: "user:u2" });
    release.resolve();
    expect(await older).toMatchObject({ failed: 1 });

    expect(fake.items.get(document.key)?.content).toContain("# one");
    expect(await indexRow("one")).toMatchObject({
      status: "pending", contentHash: null, version: before.version + 1,
      scopeKey: before.scopeKey, itemId: before.itemId, attempts: 0, nextAttemptAt: null,
    });
    expect(await findIngredientsNeedingSync(db, "u2")).toEqual(["one"]);
    expect(await syncPendingIngredientsForUser(deps(), "u2")).toMatchObject({ uploaded: 1 });
    expect(fake.items.get(document.key)).toMatchObject({ content: document.content, metadata: document.metadata });
    expect(await indexRow("one")).toMatchObject({ status: "indexed", contentHash: before.contentHash, scopeKey: before.scopeKey });
  });

  it("lets concurrent identical uploads succeed without invalidation", async () => {
    await seedIngredient("one");
    const version = (await indexRow("one"))!.version;
    await Promise.all([syncIngredients(deps(), ["one"]), syncIngredients(deps(), ["one"])]);
    expect(await indexRow("one")).toMatchObject({ status: "indexed", version });
    expect(fake.items.size).toBe(1);
  });

  it("invalidates a same-version failure without losing another sync's accepted item", async () => {
    await seedIngredient("one");
    const started = deferred<void>();
    const release = deferred<void>();
    fake.upload.mockImplementationOnce(async () => { started.resolve(); await release.promise; throw new FakeSearchError("older failure"); });
    const older = syncIngredients(deps(), ["one"]);
    await started.promise;
    await syncIngredients(deps(), ["one"]);
    const before = (await indexRow("one"))!;
    release.resolve();
    await older;
    expect(await indexRow("one")).toMatchObject({
      status: "pending", contentHash: null, version: before.version + 1,
      scopeKey: before.scopeKey, itemId: before.itemId, attempts: 0, nextAttemptAt: null,
    });
    expect(await syncIngredients(deps(), ["one"])).toMatchObject({ uploaded: 1 });
    expect(await indexRow("one")).toMatchObject({ status: "indexed", itemId: before.itemId, contentHash: before.contentHash });
  });

  it.each(["upload", "delete"])("preserves the fifth-attempt backoff after overlapping %s failures", async (operation) => {
    await seedIngredient("one");
    await syncIngredients(deps(), ["one"]);
    fake.upload.mockClear();
    if (operation === "delete") await db.delete(ingredient).where(eq(ingredient.id, "one"));
    await db.update(ingredientSearchIndex).set({
      status: "failed", attempts: MAX_INGREDIENT_SYNC_ATTEMPTS - 1, contentHash: null,
      nextAttemptAt: new Date(Date.now() - 1),
    }).where(eq(ingredientSearchIndex.ingredientId, "one"));
    const before = (await indexRow("one"))!;
    const firstStarted = deferred<void>();
    const secondStarted = deferred<void>();
    const releaseFirst = deferred<void>();
    const releaseSecond = deferred<void>();
    const firstFailure = async () => {
      firstStarted.resolve();
      await releaseFirst.promise;
      throw new FakeSearchError("first overlapping failure");
    };
    const secondFailure = async () => {
      secondStarted.resolve();
      await releaseSecond.promise;
      throw new FakeSearchError("second overlapping failure");
    };
    if (operation === "upload") fake.upload.mockImplementationOnce(firstFailure).mockImplementationOnce(secondFailure);
    else fake.remove.mockImplementationOnce(firstFailure).mockImplementationOnce(secondFailure);
    const first = syncIngredients(deps(), ["one"]);
    await firstStarted.promise;
    const second = syncIngredients(deps(), ["one"]);
    await secondStarted.promise;
    releaseFirst.resolve();
    const firstSummary = await first;
    const failed = (await indexRow("one"))!;
    releaseSecond.resolve();
    const secondSummary = await second;
    const retained = (await indexRow("one"))!;
    const immediate = await syncIngredients(deps(), ["one"]);

    expect(firstSummary).toMatchObject({ failed: 1 });
    expect(secondSummary).toMatchObject({ failed: 1 });
    expect(failed).toMatchObject({ status: "failed", attempts: MAX_INGREDIENT_SYNC_ATTEMPTS, contentHash: null });
    expect(retained).toMatchObject({
      status: "failed", attempts: failed.attempts, contentHash: null,
      scopeKey: failed.scopeKey, itemId: failed.itemId,
      nextAttemptAt: failed.nextAttemptAt, lastError: failed.lastError,
    });
    expect(failed.version).toBeGreaterThan(before.version);
    expect(retained.version).toBeGreaterThan(failed.version);
    expect(immediate).toEqual({ uploaded: 0, unchanged: 0, deleted: 0, failed: 0 });
    const now = vi.spyOn(Date, "now").mockReturnValue(failed.nextAttemptAt!.getTime());
    if (operation === "upload") {
      expect(await findIngredientsNeedingSync(db, "u1")).toEqual([]);
      expect(await syncIngredients(deps(), ["one"])).toMatchObject({ uploaded: 0, failed: 0 });
      expect(fake.upload).toHaveBeenCalledTimes(2);
    } else {
      fake.remove.mockRejectedValueOnce(new FakeSearchError("still unavailable"));
      expect(await syncPendingIngredientsForUser(deps(), "u2")).toMatchObject({ failed: 1 });
      const retried = (await indexRow("one"))!;
      expect(retried).toMatchObject({ status: "failed", attempts: MAX_INGREDIENT_SYNC_ATTEMPTS + 1, contentHash: null });
      expect(retried.nextAttemptAt!.getTime()).toBeGreaterThan(failed.nextAttemptAt!.getTime());
      now.mockReturnValue(retried.nextAttemptAt!.getTime());
      expect(await syncPendingIngredientsForUser(deps(), "u2")).toMatchObject({ deleted: 1 });
      expect(await indexRow("one")).toBeUndefined();
    }
  });

  it("fences a competing upload acceptance without reopening an exhausted live failure", async () => {
    await seedIngredient("one");
    await syncIngredients(deps(), ["one"]);
    fake.upload.mockClear();
    await db.update(ingredientSearchIndex).set({
      status: "failed", attempts: MAX_INGREDIENT_SYNC_ATTEMPTS - 1, contentHash: null, nextAttemptAt: null,
    }).where(eq(ingredientSearchIndex.ingredientId, "one"));
    const before = (await indexRow("one"))!;
    const firstStarted = deferred<void>();
    const secondAccepted = deferred<void>();
    const releaseFailure = deferred<void>();
    const releaseAcceptance = deferred<void>();
    fake.upload.mockImplementationOnce(async () => {
      firstStarted.resolve();
      await releaseFailure.promise;
      throw new FakeSearchError("uncertain overlapping upload");
    }).mockImplementationOnce(async (...args) => {
      const item = await fake.store(...args);
      secondAccepted.resolve();
      await releaseAcceptance.promise;
      return item;
    });
    const first = syncIngredients(deps(), ["one"]);
    await firstStarted.promise;
    const second = syncIngredients(deps(), ["one"]);
    await secondAccepted.promise;
    releaseFailure.resolve();
    await first;
    const failed = (await indexRow("one"))!;
    releaseAcceptance.resolve();
    await second;

    expect(failed.version).toBeGreaterThan(before.version);
    expect(await indexRow("one")).toMatchObject({
      status: "failed", attempts: MAX_INGREDIENT_SYNC_ATTEMPTS, contentHash: null,
      nextAttemptAt: failed.nextAttemptAt, lastError: failed.lastError,
    });
    expect(await syncIngredients(deps(), ["one"])).toMatchObject({ uploaded: 0, failed: 0 });
    expect(fake.upload).toHaveBeenCalledTimes(2);
    await db.update(ingredient).set({ name: "New catalog edit", userId: "u2" }).where(eq(ingredient.id, "one"));
    expect(await indexRow("one")).toMatchObject({ status: "pending", attempts: 0, nextAttemptAt: null, scopeKey: "user:u2" });
    expect(await syncPendingIngredientsForUser(deps(), "u2")).toMatchObject({ uploaded: 1 });
    expect(fake.items.get("ingredients/one.md")).toMatchObject({
      content: expect.stringContaining("# New catalog edit"), metadata: { ingredient_id: "one", scope_key: "user:u2" },
    });
  });

  it("retains a committed fifth-attempt failure when its D1 response times out before the remote rejection", async () => {
    await seedIngredient("one");
    await syncIngredients(deps(), ["one"]);
    fake.upload.mockClear();
    await db.update(ingredientSearchIndex).set({
      status: "failed", attempts: MAX_INGREDIENT_SYNC_ATTEMPTS - 1, contentHash: null, nextAttemptAt: null,
    }).where(eq(ingredientSearchIndex.ingredientId, "one"));
    const start = Date.now();
    const now = vi.spyOn(Date, "now").mockReturnValue(start);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const background: Promise<unknown>[] = [];
    const started = deferred<void>();
    const releaseRemote = deferred<void>();
    const committed = deferred<void>();
    const releaseResponse = deferred<void>();
    const responseReturned = deferred<void>();
    fake.upload.mockImplementationOnce(async (...args) => {
      now.mockReturnValue(start + INGREDIENT_SYNC_BUDGET_MS - 100);
      started.resolve();
      await releaseRemote.promise;
      await fake.store(...args);
      throw new FakeSearchError("remote rejection after committed timeout state");
    });
    const pending = syncIngredients(deps((promise) => { background.push(promise); }), ["one"])
      .then(() => undefined, (error: unknown) => error);
    await started.promise;
    const originalAll: Db["all"] = db.all.bind(db);
    vi.spyOn(db, "all").mockImplementationOnce((query) => {
      const pendingQuery = originalAll(query);
      const execute = pendingQuery.execute.bind(pendingQuery);
      pendingQuery.execute = async () => {
        const result = await execute();
        committed.resolve();
        await releaseResponse.promise;
        responseReturned.resolve();
        return result;
      };
      return pendingQuery;
    });
    await committed.promise;
    const failed = (await indexRow("one"))!;
    const persistenceError = await pending;
    releaseRemote.resolve();
    await Promise.all(background);
    releaseResponse.resolve();
    await responseReturned.promise;

    expect(persistenceError).toBeInstanceOf(IngredientIndexTimeoutError);
    expect(persistenceError).toMatchObject({ operation: "persist", timeoutMs: 100 });
    expect(failed).toMatchObject({ status: "failed", attempts: MAX_INGREDIENT_SYNC_ATTEMPTS, contentHash: null });
    expect(await indexRow("one")).toMatchObject({
      status: "failed", attempts: failed.attempts, contentHash: null,
      scopeKey: failed.scopeKey, itemId: failed.itemId,
      nextAttemptAt: failed.nextAttemptAt, lastError: failed.lastError,
    });
    expect(await syncIngredients(deps(), ["one"])).toMatchObject({ uploaded: 0, failed: 0 });
    now.mockReturnValue(failed.nextAttemptAt!.getTime());
    expect(await findIngredientsNeedingSync(db, "u1")).toEqual([]);
    expect(await syncIngredients(deps(), ["one"])).toMatchObject({ uploaded: 0, failed: 0 });
    expect(fake.upload).toHaveBeenCalledTimes(1);
  }, 15_000);

  it("recreates a scoped tombstone when a first upload completes after deletion cleanup removed the row", async () => {
    await seedIngredient("one");
    const started = deferred<void>();
    const release = deferred<void>();
    fake.upload.mockImplementationOnce(async (...args) => { started.resolve(); await release.promise; return fake.store(...args); });
    const older = syncIngredients(deps(), ["one"]);
    await started.promise;
    await db.delete(ingredient).where(eq(ingredient.id, "one"));
    expect(await syncIngredients(deps(), ["one"])).toMatchObject({ deleted: 1 });
    expect(await indexRow("one")).toBeUndefined();
    release.resolve();
    await older;

    expect(await indexRow("one")).toMatchObject({ scopeKey: "user:u1", itemId: fake.items.get("ingredients/one.md")?.id, status: "pending", contentHash: null });
    expect(await syncPendingIngredientsForUser(deps(), "u2")).toMatchObject({ deleted: 1 });
    expect(fake.items.size).toBe(0);
    expect(await indexRow("one")).toBeUndefined();
  });

  it("retains an uncertain tombstone when an upload accepts content but rejects after deletion cleanup", async () => {
    await seedIngredient("one");
    const started = deferred<void>();
    const release = deferred<void>();
    fake.upload.mockImplementationOnce(async (...args) => {
      started.resolve();
      await release.promise;
      await fake.store(...args);
      throw new FakeSearchError("response lost after acceptance");
    });
    const older = syncIngredients(deps(), ["one"]);
    await started.promise;
    await db.delete(ingredient).where(eq(ingredient.id, "one"));
    await syncIngredients(deps(), ["one"]);
    expect(await indexRow("one")).toBeUndefined();
    release.resolve();
    expect(await older).toMatchObject({ failed: 1 });
    const row = (await indexRow("one"))!;
    expect(row).toMatchObject({ scopeKey: "user:u1", itemId: null, status: "failed" });
    vi.spyOn(Date, "now").mockReturnValue(row.nextAttemptAt!.getTime());
    await syncPendingIngredientsForUser(deps(), "u2");
    expect(fake.items.size).toBe(0);
    expect(await indexRow("one")).toBeUndefined();
  });

  it("retains a newly returned remote ID when an old upload recreates a remotely deleted item", async () => {
    await seedIngredient("one");
    await syncIngredients(deps(), ["one"]);
    const originalId = (await indexRow("one"))!.itemId;
    await db.update(ingredient).set({ notes: "Changed" }).where(eq(ingredient.id, "one"));
    const started = deferred<void>();
    const release = deferred<void>();
    fake.upload.mockImplementationOnce(async (...args) => { started.resolve(); await release.promise; return fake.store(...args); });
    const older = syncIngredients(deps(), ["one"]);
    await started.promise;
    await db.delete(ingredient).where(eq(ingredient.id, "one"));
    await syncIngredients(deps(), ["one"]);
    release.resolve();
    await older;
    const row = (await indexRow("one"))!;
    expect(row.itemId).not.toBe(originalId);
    expect(row.itemId).toBe(fake.items.get("ingredients/one.md")?.id);
    expect(await syncPendingIngredientsForUser(deps(), "u2")).toMatchObject({ deleted: 1 });
    expect(fake.items.size).toBe(0);
  });

  it("keeps a newer tombstone when an older delete finishes after another upload returned a new item ID", async () => {
    await seedIngredient("one");
    await syncIngredients(deps(), ["one"]);
    await db.update(ingredient).set({ notes: "Changed" }).where(eq(ingredient.id, "one"));
    const uploadStarted = deferred<void>();
    const releaseUpload = deferred<void>();
    fake.upload.mockImplementationOnce(async (...args) => { uploadStarted.resolve(); await releaseUpload.promise; return fake.store(...args); });
    const olderUpload = syncIngredients(deps(), ["one"]);
    await uploadStarted.promise;
    await db.delete(ingredient).where(eq(ingredient.id, "one"));
    const deleteStarted = deferred<void>();
    const releaseDelete = deferred<void>();
    fake.remove.mockImplementationOnce(async (id) => { await fake.deleteStored(id); deleteStarted.resolve(); await releaseDelete.promise; });
    const olderDelete = syncIngredients(deps(), ["one"]);
    await deleteStarted.promise;
    releaseUpload.resolve();
    await olderUpload;
    const itemId = (await indexRow("one"))!.itemId;
    releaseDelete.resolve();
    await olderDelete;

    expect(await indexRow("one")).toMatchObject({ itemId, status: "pending" });
    expect(await syncPendingIngredientsForUser(deps(), "u2")).toMatchObject({ deleted: 1 });
    expect(fake.items.size).toBe(0);
  });

  it("does not lose a newer remote item when an obsolete upload response arrives after deletion and recreation", async () => {
    await seedIngredient("one");
    await syncIngredients(deps(), ["one"]);
    await db.update(ingredient).set({ notes: "Changed" }).where(eq(ingredient.id, "one"));
    const oldCommitted = deferred<void>();
    const releaseOldResponse = deferred<void>();
    fake.upload.mockImplementationOnce(async (...args) => {
      const item = await fake.store(...args);
      oldCommitted.resolve();
      await releaseOldResponse.promise;
      return item;
    });
    const older = syncIngredients(deps(), ["one"]);
    await oldCommitted.promise;
    const newerStarted = deferred<void>();
    const releaseNewer = deferred<void>();
    fake.upload.mockImplementationOnce(async (...args) => { newerStarted.resolve(); await releaseNewer.promise; return fake.store(...args); });
    const newer = syncIngredients(deps(), ["one"]);
    await newerStarted.promise;
    await db.delete(ingredient).where(eq(ingredient.id, "one"));
    await syncIngredients(deps(), ["one"]);
    releaseNewer.resolve();
    await newer;
    releaseOldResponse.resolve();
    await older;

    await syncPendingIngredientsForUser(deps(), "u2");
    expect(fake.items.size).toBe(0);
    expect(await indexRow("one")).toBeUndefined();
  });

  it.each(["succeeds", "rejects"])("invalidates a recreated live row when an older delete %s after removing its newer upload", async (outcome) => {
    await seedIngredient("one");
    await syncIngredients(deps(), ["one"]);
    await db.delete(ingredient).where(eq(ingredient.id, "one"));
    const started = deferred<void>();
    const release = deferred<void>();
    fake.remove.mockImplementationOnce(async (id) => {
      started.resolve();
      await release.promise;
      await fake.deleteStored(id);
      if (outcome === "rejects") throw new FakeSearchError("response lost after deletion");
    });
    const older = syncIngredients(deps(), ["one"]);
    await started.promise;
    await seedIngredient("one", "u2");
    await db.update(ingredient).set({ name: "Recreated" }).where(eq(ingredient.id, "one"));
    const document = buildIngredientDocument((await loadIngredientDocumentInputs(db, ["one"])).get("one")!);
    await syncIngredients(deps(), ["one"]);
    const before = (await indexRow("one"))!;
    expect(before).toMatchObject({ status: "indexed", scopeKey: "user:u2", contentHash: await hashIngredientDocument(document) });
    release.resolve();
    expect(await older).toMatchObject({ failed: outcome === "rejects" ? 1 : 0 });

    expect(await indexRow("one")).toMatchObject({
      status: "pending", contentHash: null, version: before.version + 1,
      scopeKey: before.scopeKey, itemId: before.itemId, attempts: 0, nextAttemptAt: null,
    });
    expect(fake.items.size).toBe(0);
    expect(await findIngredientsNeedingSync(db, "u2")).toEqual(["one"]);
    expect(await syncPendingIngredientsForUser(deps(), "u2")).toMatchObject({ uploaded: 1 });
    expect(fake.items.get(document.key)).toMatchObject({ content: document.content, metadata: document.metadata });
    expect(await indexRow("one")).toMatchObject({ status: "indexed", scopeKey: before.scopeKey, contentHash: before.contentHash });
  });

  it("rejects a stale acceptance when an ID is deleted/recreated and its version counter repeats", async () => {
    await seedIngredient("one");
    const started = deferred<void>();
    const release = deferred<void>();
    fake.upload.mockImplementationOnce(async (...args) => { started.resolve(); await release.promise; return fake.store(...args); });
    const older = syncIngredients(deps(), ["one"]);
    await started.promise;
    await db.delete(ingredient).where(eq(ingredient.id, "one"));
    await syncIngredients(deps(), ["one"]);
    await db.insert(ingredient).values({ id: "one", userId: "u1", name: "Recreated", normalizedName: "recreated", costBasisUnit: "G" });
    expect((await indexRow("one"))?.version).toBe(1);
    release.resolve();
    await older;
    expect(await indexRow("one")).toMatchObject({ status: "pending", contentHash: null });
    await syncIngredients(deps(), ["one"]);
    expect(fake.items.get("ingredients/one.md")?.content).toContain("# Recreated");
  });

  it("records upload timeouts and retains late accepted IDs after tombstone cleanup", async () => {
    await seedIngredient("one");
    const background: Promise<unknown>[] = [];
    const started = deferred<void>();
    const release = deferred<void>();
    fake.upload.mockImplementationOnce(async (...args) => { started.resolve(); await release.promise; return fake.store(...args); });
    const older = syncIngredients(deps((promise) => { background.push(promise); }), ["one"]);
    await started.promise;
    expect(await older).toMatchObject({ failed: 1 });
    expect(await indexRow("one")).toMatchObject({ status: "failed", attempts: 1, lastError: expect.stringContaining(`upload timed out after ${INGREDIENT_INDEX_IO_TIMEOUT_MS}ms`) });
    await db.delete(ingredient).where(eq(ingredient.id, "one"));
    await syncIngredients(deps(), ["one"]);
    release.resolve();
    await Promise.all(background);
    expect(await indexRow("one")).toMatchObject({ itemId: fake.items.get("ingredients/one.md")?.id, status: "pending", scopeKey: "user:u1" });
    await syncPendingIngredientsForUser(deps(), "u2");
    expect(fake.items.size).toBe(0);
  }, 15_000);

  it("invalidates newer uploads at an older upload timeout and again after its late rejection", async () => {
    await seedIngredient("one");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const background: Promise<unknown>[] = [];
    const started = deferred<void>();
    const release = deferred<void>();
    fake.upload.mockImplementationOnce(async (...args) => {
      started.resolve();
      await release.promise;
      await fake.store(...args);
      throw new FakeSearchError("late response lost after acceptance");
    });
    const older = syncIngredients(deps((promise) => { background.push(promise); }), ["one"]);
    await started.promise;
    await db.update(ingredient).set({ name: "Newer name", userId: "u2" }).where(eq(ingredient.id, "one"));
    const document = buildIngredientDocument((await loadIngredientDocumentInputs(db, ["one"])).get("one")!);
    await syncIngredients(deps(), ["one"]);
    const before = (await indexRow("one"))!;
    expect(before.status).toBe("indexed");
    expect(await older).toMatchObject({ failed: 1 });
    expect(await indexRow("one")).toMatchObject({
      status: "pending", contentHash: null, version: before.version + 1,
      scopeKey: before.scopeKey, itemId: before.itemId, attempts: 0, nextAttemptAt: null,
    });
    expect(await syncPendingIngredientsForUser(deps(), "u2")).toMatchObject({ uploaded: 1 });
    const repaired = (await indexRow("one"))!;
    expect(repaired.status).toBe("indexed");
    release.resolve();
    await Promise.all(background);

    expect(error).toHaveBeenCalledTimes(1);
    expect(fake.items.get(document.key)?.content).toContain("# one");
    expect(await indexRow("one")).toMatchObject({
      status: "pending", contentHash: null, version: repaired.version + 1,
      scopeKey: repaired.scopeKey, itemId: repaired.itemId, attempts: 0, nextAttemptAt: null,
    });
    expect(await syncPendingIngredientsForUser(deps(), "u2")).toMatchObject({ uploaded: 1 });
    expect(fake.items.get(document.key)).toMatchObject({ content: document.content, metadata: document.metadata });
    expect(await indexRow("one")).toMatchObject({ status: "indexed", contentHash: before.contentHash });
  }, 15_000);

  it.each(["upload", "delete"])("preserves its own fifth %s timeout attempt and backoff after the same operation rejects late", async (operation) => {
    await seedIngredient("one");
    await syncIngredients(deps(), ["one"]);
    if (operation === "delete") await db.delete(ingredient).where(eq(ingredient.id, "one"));
    else await db.update(ingredient).set({ name: "Changed" }).where(eq(ingredient.id, "one"));
    await db.update(ingredientSearchIndex).set({
      status: "failed", attempts: MAX_INGREDIENT_SYNC_ATTEMPTS - 1, nextAttemptAt: null,
    }).where(eq(ingredientSearchIndex.ingredientId, "one"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const background: Promise<unknown>[] = [];
    const started = deferred<void>();
    const release = deferred<void>();
    if (operation === "upload") {
      fake.upload.mockImplementationOnce(async (...args) => {
        started.resolve();
        await release.promise;
        await fake.store(...args);
        throw new FakeSearchError("late response lost after acceptance");
      });
    } else {
      fake.remove.mockImplementationOnce(async (id) => {
        started.resolve();
        await release.promise;
        await fake.deleteStored(id);
        throw new FakeSearchError("late response lost after deletion");
      });
    }
    const pending = syncIngredients(deps((promise) => { background.push(promise); }), ["one"]);
    await started.promise;
    expect(await pending).toMatchObject({ failed: 1 });
    const timedOut = (await indexRow("one"))!;
    expect(timedOut).toMatchObject({ status: "failed", attempts: MAX_INGREDIENT_SYNC_ATTEMPTS, contentHash: null });
    expect(timedOut.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
    release.resolve();
    await Promise.all(background);
    expect(await indexRow("one")).toEqual(timedOut);

    vi.spyOn(Date, "now").mockReturnValue(timedOut.nextAttemptAt!.getTime());
    if (operation === "upload") {
      expect(await findIngredientsNeedingSync(db, "u1")).toEqual([]);
      expect(await syncIngredients(deps(), ["one"])).toMatchObject({ uploaded: 0, failed: 0 });
      expect(fake.upload).toHaveBeenCalledTimes(2);
    } else {
      expect(await syncPendingIngredientsForUser(deps(), "u2")).toMatchObject({ deleted: 1 });
      expect(await indexRow("one")).toBeUndefined();
    }
  }, 15_000);

  it.each(["succeeds", "rejects"])("invalidates newer live content when a timed-out delete later %s after removing its newer upload", async (outcome) => {
    await seedIngredient("one");
    await syncIngredients(deps(), ["one"]);
    await db.delete(ingredient).where(eq(ingredient.id, "one"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const background: Promise<unknown>[] = [];
    const started = deferred<void>();
    const release = deferred<void>();
    fake.remove.mockImplementationOnce(async (id) => {
      started.resolve();
      await release.promise;
      await fake.deleteStored(id);
      if (outcome === "rejects") throw new FakeSearchError("late response lost after deletion");
    });
    const older = syncIngredients(deps((promise) => { background.push(promise); }), ["one"]);
    await started.promise;
    await db.insert(ingredient).values({ id: "one", userId: "u2", name: "Recreated", normalizedName: "recreated", costBasisUnit: "G" });
    const document = buildIngredientDocument((await loadIngredientDocumentInputs(db, ["one"])).get("one")!);
    await syncIngredients(deps(), ["one"]);
    const before = (await indexRow("one"))!;
    expect(before.status).toBe("indexed");
    expect(await older).toMatchObject({ failed: 1 });
    expect(await indexRow("one")).toMatchObject({
      status: "pending", contentHash: null, version: before.version + 1,
      scopeKey: before.scopeKey, itemId: before.itemId, attempts: 0, nextAttemptAt: null,
    });
    expect(await syncPendingIngredientsForUser(deps(), "u2")).toMatchObject({ uploaded: 1 });
    const repaired = (await indexRow("one"))!;
    release.resolve();
    await Promise.all(background);
    expect(error).toHaveBeenCalledTimes(outcome === "rejects" ? 1 : 0);
    expect(fake.items.size).toBe(0);
    expect(await indexRow("one")).toMatchObject({
      status: "pending", contentHash: null, version: repaired.version + 1,
      scopeKey: repaired.scopeKey, itemId: repaired.itemId, attempts: 0, nextAttemptAt: null,
    });
    expect(await syncPendingIngredientsForUser(deps(), "u2")).toMatchObject({ uploaded: 1 });
    expect(fake.items.get(document.key)).toMatchObject({ content: document.content, metadata: document.metadata });
    expect(await indexRow("one")).toMatchObject({ status: "indexed", contentHash: before.contentHash });
  }, 15_000);

  it("recreates a deletion tombstone when a timed-out delete rejects after cleanup removed its row", async () => {
    await seedIngredient("one");
    await syncIngredients(deps(), ["one"]);
    await db.delete(ingredient).where(eq(ingredient.id, "one"));
    const before = (await indexRow("one"))!;
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const background: Promise<unknown>[] = [];
    const started = deferred<void>();
    const release = deferred<void>();
    fake.remove.mockImplementationOnce(async (id) => {
      await fake.deleteStored(id);
      started.resolve();
      await release.promise;
      throw new FakeSearchError("late response lost after deletion");
    });
    const older = syncIngredients(deps((promise) => { background.push(promise); }), ["one"]);
    await started.promise;
    expect(fake.items.size).toBe(0);
    expect(await older).toMatchObject({ failed: 1 });
    const timedOut = (await indexRow("one"))!;
    expect(timedOut).toMatchObject({ status: "failed", attempts: 1, itemId: before.itemId });
    const now = vi.spyOn(Date, "now").mockReturnValue(timedOut.nextAttemptAt!.getTime());
    expect(await syncPendingIngredientsForUser(deps(), "u2")).toMatchObject({ deleted: 1 });
    expect(await indexRow("one")).toBeUndefined();
    release.resolve();
    await Promise.all(background);

    const retained = (await indexRow("one"))!;
    expect(retained).toMatchObject({
      scopeKey: before.scopeKey, itemId: before.itemId, contentHash: null,
      status: "failed", attempts: 1, version: before.version + 1, lastError: "late response lost after deletion",
    });
    expect(error).toHaveBeenCalledTimes(1);
    now.mockReturnValue(retained.nextAttemptAt!.getTime());
    expect(await syncPendingIngredientsForUser(deps(), "u2")).toMatchObject({ deleted: 1 });
    expect(fake.list).toHaveBeenLastCalledWith({ key: "ingredients/one.md", source: "builtin", per_page: 1 });
    expect(fake.items.size).toBe(0);
    expect(await indexRow("one")).toBeUndefined();
  }, 15_000);

  it("retains uncertain remote content when a timed-out upload rejects after cleanup", async () => {
    await seedIngredient("one");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const background: Promise<unknown>[] = [];
    const started = deferred<void>();
    const release = deferred<void>();
    fake.upload.mockImplementationOnce(async (...args) => {
      started.resolve();
      await release.promise;
      await fake.store(...args);
      throw new FakeSearchError("late response lost after acceptance");
    });
    const older = syncIngredients(deps((promise) => { background.push(promise); }), ["one"]);
    await started.promise;
    expect(await older).toMatchObject({ failed: 1 });
    await db.delete(ingredient).where(eq(ingredient.id, "one"));
    await syncIngredients(deps(), ["one"]);
    release.resolve();
    await Promise.all(background);
    const row = (await indexRow("one"))!;
    expect(row).toMatchObject({ scopeKey: "user:u1", itemId: null, status: "failed" });
    expect(error).toHaveBeenCalledTimes(1);
    vi.spyOn(Date, "now").mockReturnValue(row.nextAttemptAt!.getTime());
    await syncPendingIngredientsForUser(deps(), "u2");
    expect(fake.items.size).toBe(0);
  }, 15_000);
});

describe("ingredient search configuration and queue nudges", () => {
  it("returns null for missing bindings/settings and refuses the production instance in dev", () => {
    const get = vi.fn(() => fake.instance);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(getIngredientSearchInstance({}, false)).toBeNull();
    expect(getIngredientSearchInstance({ INGREDIENT_AI_SEARCH_INSTANCE: "development" }, false)).toBeNull();
    expect(getIngredientSearchInstance({ AI_SEARCH: { get }, INGREDIENT_AI_SEARCH_INSTANCE: "  " }, false)).toBeNull();
    expect(getIngredientSearchInstance({ AI_SEARCH: { get }, INGREDIENT_AI_SEARCH_INSTANCE: ` ${PRODUCTION_INGREDIENT_SEARCH_INSTANCE} ` }, true)).toBeNull();
    expect(get).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
    expect(getIngredientSearchInstance({ AI_SEARCH: { get }, INGREDIENT_AI_SEARCH_INSTANCE: PRODUCTION_INGREDIENT_SEARCH_INSTANCE }, false)).toBe(fake.instance);
    expect(getIngredientSearchInstance(searchEnv(), true)).toBe(fake.instance);
  });

  it("only nudges one bounded background batch without changing transactional dirty versions", async () => {
    const ids = await seedManyIngredients(30);
    const background: Promise<unknown>[] = [];
    const before = (await indexRow(ids[0]))!.version;
    await queueIngredientIndexSync(db, searchEnv(), (promise) => { background.push(promise); }, [...ids, ...ids]);
    await Promise.all(background);
    expect(fake.upload).toHaveBeenCalledTimes(DEFAULT_INGREDIENT_SYNC_BATCH_SIZE);
    expect((await indexRow(ids[0]))?.version).toBe(before);
    expect(await findIngredientsNeedingSync(db, "u1")).toHaveLength(10);
  });

  it("leaves durable state untouched when configuration or waitUntil is absent", async () => {
    await seedIngredient("one");
    const before = await indexRow("one");
    const waitUntil = vi.fn();
    await queueIngredientIndexSync(db, searchEnv(), undefined, ["one"]);
    await queueIngredientIndexSync(db, {}, waitUntil, ["one"]);
    await queueIngredientIndexSync(db, searchEnv(), waitUntil, []);
    expect(waitUntil).not.toHaveBeenCalled();
    expect(await indexRow("one")).toEqual(before);
    expect(fake.upload).not.toHaveBeenCalled();
  });

  it("never rejects the user's write for binding or background search failures", async () => {
    await seedIngredient("one");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(queueIngredientIndexSync(db, {
      INGREDIENT_AI_SEARCH_INSTANCE: "development", AI_SEARCH: { get: () => { throw new FakeSearchError("private ingredient text in a provider error"); } },
    }, () => undefined, ["one"])).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(error.mock.calls)).not.toContain("private ingredient text");
    fake.upload.mockRejectedValueOnce(new FakeSearchError("upload failure"));
    const background: Promise<unknown>[] = [];
    await expect(queueIngredientIndexSync(db, searchEnv(), (promise) => { background.push(promise); }, ["one"])).resolves.toBeUndefined();
    await Promise.all(background);
    expect(await indexRow("one")).toMatchObject({ status: "failed", attempts: 1, version: 2 });
  });

  it("still records accepted uploads if a completion waitUntil callback throws", async () => {
    await seedIngredient("one");
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await syncIngredients(deps(() => { throw new FakeSearchError("waitUntil unavailable"); }), ["one"])).toMatchObject({ uploaded: 1 });
    expect((await indexRow("one"))?.status).toBe("indexed");
    expect(error).toHaveBeenCalledTimes(1);
  });
});

describe("ingredient retry delay", () => {
  it("matches recipe-style exponential backoff but caps long-lived deletion retries", () => {
    expect([1, 2, 3, 4].map(ingredientRetryDelayMs)).toEqual([60_000, 240_000, 960_000, 3_840_000]);
    expect(ingredientRetryDelayMs(1_000)).toBe(MAX_INGREDIENT_RETRY_DELAY_MS);
  });
});
