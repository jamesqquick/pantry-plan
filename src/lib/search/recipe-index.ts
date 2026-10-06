/**
 * Keeps the AI Search instance in step with D1 recipes.
 *
 * Write paths call `markRecipesDirty` (awaited, cheap D1 upsert) and then
 * `syncRecipes` in `waitUntil`. If the background sync dies, the rows stay
 * `pending`/`failed` and `syncPendingForUser` retries them later. The
 * `contentHash` column always reflects what AI Search last accepted, so
 * marking a recipe dirty without changing it costs no upload.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  ingredient,
  recipe,
  recipeIngredient,
  recipeInstruction,
  recipeSearchIndex,
  recipeTag,
  tag,
  type Db,
} from "@/db";
import {
  buildRecipeDocument,
  hashRecipeDocument,
  type RecipeDocumentInput,
} from "./recipe-document";

export const PRODUCTION_SEARCH_INSTANCE = "quickpantry-recipes";
export const MAX_SYNC_ATTEMPTS = 5;
export const DEFAULT_SYNC_BATCH_SIZE = 20;
/** D1 caps bound parameters per statement at 100. */
const ID_CHUNK_SIZE = 90;

export type RecipeSearchInstance = {
  search: AiSearchInstance["search"];
  items: Pick<AiSearchItems, "upload" | "delete">;
};

export type RecipeIndexDeps = {
  db: Db;
  instance: RecipeSearchInstance;
};

export type SyncSummary = {
  uploaded: number;
  unchanged: number;
  deleted: number;
  failed: number;
};

type SearchEnv = Pick<Env, "AI_SEARCH" | "AI_SEARCH_INSTANCE">;

/**
 * Resolve the configured AI Search instance, or null when search is not
 * configured. Local dev never touches the production index: the binding is
 * always remote, so a missing `.dev.vars` override would otherwise write test
 * data to production.
 */
export function getRecipeSearchInstance(
  env: SearchEnv,
  isDev: boolean = import.meta.env.DEV,
): RecipeSearchInstance | null {
  const name = env.AI_SEARCH_INSTANCE;
  if (!env.AI_SEARCH || !name) return null;
  if (isDev && name === PRODUCTION_SEARCH_INSTANCE) {
    console.error(
      JSON.stringify({
        message:
          "Refusing to use the production AI Search instance in local dev. Set AI_SEARCH_INSTANCE in .dev.vars.",
      }),
    );
    return null;
  }
  return env.AI_SEARCH.get(name);
}

function chunk<T>(items: readonly T[], size = ID_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

function isNotFoundError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "AiSearchNotFoundError" ||
    /item_not_found|not found/i.test(error.message)
  );
}

/** Flag recipes for (re)upload. Unknown ids are ignored. */
export async function markRecipesDirty(
  db: Db,
  recipeIds: readonly string[],
): Promise<void> {
  const unique = [...new Set(recipeIds)];
  for (const ids of chunk(unique)) {
    await db.run(sql`
      INSERT INTO ${recipeSearchIndex} (recipeId, userId, status, attempts)
      SELECT ${recipe.id}, ${recipe.userId}, 'pending', 0
      FROM ${recipe}
      WHERE ${inArray(recipe.id, ids)}
      ON CONFLICT (recipeId) DO UPDATE SET
        status = 'pending',
        attempts = 0,
        lastError = NULL,
        updatedAt = ${Date.now()}
    `);
  }
}

/** Recipes whose document mentions this ingredient's name. */
export async function recipeIdsUsingIngredient(
  db: Db,
  ingredientId: string,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: recipeIngredient.recipeId })
    .from(recipeIngredient)
    .where(eq(recipeIngredient.ingredientId, ingredientId));
  return rows.map((row) => row.id);
}

/** Recipes tagged with this tag. Call before deleting the tag (cascade). */
export async function recipeIdsWithTag(db: Db, tagId: string): Promise<string[]> {
  const rows = await db
    .select({ id: recipeTag.recipeId })
    .from(recipeTag)
    .where(eq(recipeTag.tagId, tagId));
  return rows.map((row) => row.id);
}

export async function loadRecipeDocumentInputs(
  db: Db,
  recipeIds: readonly string[],
): Promise<Map<string, RecipeDocumentInput>> {
  const inputs = new Map<string, RecipeDocumentInput>();
  for (const ids of chunk([...new Set(recipeIds)])) {
    const [recipes, tags, ingredients, instructions] = await Promise.all([
      db
        .select({
          id: recipe.id,
          userId: recipe.userId,
          title: recipe.title,
          notes: recipe.notes,
          servings: recipe.servings,
          prepTimeMinutes: recipe.prepTimeMinutes,
          cookTimeMinutes: recipe.cookTimeMinutes,
          totalTimeMinutes: recipe.totalTimeMinutes,
        })
        .from(recipe)
        .where(inArray(recipe.id, ids)),
      db
        .select({ recipeId: recipeTag.recipeId, name: tag.name })
        .from(recipeTag)
        .innerJoin(tag, eq(tag.id, recipeTag.tagId))
        .where(inArray(recipeTag.recipeId, ids)),
      db
        .select({
          recipeId: recipeIngredient.recipeId,
          displayText: recipeIngredient.displayText,
          rawText: recipeIngredient.rawText,
          name: ingredient.name,
        })
        .from(recipeIngredient)
        .leftJoin(ingredient, eq(ingredient.id, recipeIngredient.ingredientId))
        .where(inArray(recipeIngredient.recipeId, ids))
        .orderBy(recipeIngredient.recipeId, recipeIngredient.sortOrder),
      db
        .select({
          recipeId: recipeInstruction.recipeId,
          text: recipeInstruction.text,
        })
        .from(recipeInstruction)
        .where(inArray(recipeInstruction.recipeId, ids))
        .orderBy(recipeInstruction.recipeId, recipeInstruction.sortOrder),
    ]);

    for (const row of recipes) {
      inputs.set(row.id, { ...row, tags: [], ingredients: [], instructions: [] });
    }
    for (const row of tags) inputs.get(row.recipeId)?.tags.push(row.name);
    for (const row of ingredients) {
      inputs.get(row.recipeId)?.ingredients.push({
        text: row.rawText || row.displayText,
        name: row.name,
      });
    }
    for (const row of instructions) {
      inputs.get(row.recipeId)?.instructions.push(row.text);
    }
  }
  return inputs;
}

async function upsertIndexRow(
  db: Db,
  values: typeof recipeSearchIndex.$inferInsert,
): Promise<void> {
  const { recipeId: _recipeId, ...update } = values;
  await db
    .insert(recipeSearchIndex)
    .values(values)
    .onConflictDoUpdate({ target: recipeSearchIndex.recipeId, set: update });
}

async function deleteRemoteItem(
  instance: RecipeSearchInstance,
  itemId: string | null,
): Promise<void> {
  if (!itemId) return;
  try {
    await instance.items.delete(itemId);
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }
}

/**
 * Upload changed recipes, skip unchanged ones, and remove index entries for
 * recipes that no longer exist. Never throws for per-recipe failures; they are
 * recorded on the row and counted in the summary.
 */
export async function syncRecipes(
  deps: RecipeIndexDeps,
  recipeIds: readonly string[],
): Promise<SyncSummary> {
  const { db, instance } = deps;
  const summary: SyncSummary = { uploaded: 0, unchanged: 0, deleted: 0, failed: 0 };
  const unique = [...new Set(recipeIds)];
  if (unique.length === 0) return summary;

  const documents = await loadRecipeDocumentInputs(db, unique);
  const rows = new Map<string, typeof recipeSearchIndex.$inferSelect>();
  for (const ids of chunk(unique)) {
    const found = await db
      .select()
      .from(recipeSearchIndex)
      .where(inArray(recipeSearchIndex.recipeId, ids));
    for (const row of found) rows.set(row.recipeId, row);
  }

  for (const recipeId of unique) {
    const row = rows.get(recipeId);
    const input = documents.get(recipeId);

    if (!input) {
      if (!row) continue;
      try {
        await deleteRemoteItem(instance, row.itemId);
        await db
          .delete(recipeSearchIndex)
          .where(eq(recipeSearchIndex.recipeId, recipeId));
        summary.deleted++;
      } catch (error) {
        summary.failed++;
        await db
          .update(recipeSearchIndex)
          .set({
            status: "failed",
            attempts: row.attempts + 1,
            lastError: errorMessage(error),
          })
          .where(eq(recipeSearchIndex.recipeId, recipeId));
      }
      continue;
    }

    const document = buildRecipeDocument(input);
    const contentHash = await hashRecipeDocument(document);
    if (row?.itemId && row.contentHash === contentHash) {
      if (row.status !== "indexed") {
        await db
          .update(recipeSearchIndex)
          .set({ status: "indexed", attempts: 0, lastError: null })
          .where(eq(recipeSearchIndex.recipeId, recipeId));
      }
      summary.unchanged++;
      continue;
    }

    try {
      const item = await instance.items.upload(document.key, document.content, {
        metadata: document.metadata,
      });
      await upsertIndexRow(db, {
        recipeId,
        userId: input.userId,
        itemId: item.id,
        contentHash,
        status: "indexed",
        attempts: 0,
        lastError: null,
        indexedAt: new Date(),
      });
      summary.uploaded++;
    } catch (error) {
      summary.failed++;
      await upsertIndexRow(db, {
        recipeId,
        userId: input.userId,
        // Keep the last accepted item/hash: that is still what AI Search holds.
        itemId: row?.itemId ?? null,
        contentHash: row?.contentHash ?? null,
        status: "failed",
        attempts: (row?.attempts ?? 0) + 1,
        lastError: errorMessage(error),
      });
    }
  }

  return summary;
}

/** Recipe ids for a user that are missing, pending, retryable, or tombstoned. */
export async function findRecipesNeedingSync(
  db: Db,
  userId: string,
  limit = DEFAULT_SYNC_BATCH_SIZE,
): Promise<string[]> {
  const rows = await db.all<{ id: string }>(sql`
    SELECT r.id AS id FROM ${recipe} r
    LEFT JOIN ${recipeSearchIndex} i ON i.recipeId = r.id
    WHERE r.userId = ${userId}
      AND (
        i.recipeId IS NULL
        OR i.status = 'pending'
        OR (i.status = 'failed' AND i.attempts < ${MAX_SYNC_ATTEMPTS})
      )
    UNION
    SELECT i.recipeId AS id FROM ${recipeSearchIndex} i
    LEFT JOIN ${recipe} r ON r.id = i.recipeId
    WHERE i.userId = ${userId}
      AND r.id IS NULL
      AND i.attempts < ${MAX_SYNC_ATTEMPTS}
    LIMIT ${limit}
  `);
  return rows.map((row) => row.id);
}

/** Lazy backfill + retry for one user, bounded to keep subrequests low. */
export async function syncPendingForUser(
  deps: RecipeIndexDeps,
  userId: string,
  limit = DEFAULT_SYNC_BATCH_SIZE,
): Promise<SyncSummary> {
  const ids = await findRecipesNeedingSync(deps.db, userId, limit);
  return syncRecipes(deps, ids);
}

/**
 * Admin: force every recipe to re-upload on its next sync (e.g. after
 * switching instances or changing the document format), then process one
 * batch. Remaining recipes drain via later batches or per-user backfill.
 */
export async function reindexAll(
  deps: RecipeIndexDeps,
  batchSize = DEFAULT_SYNC_BATCH_SIZE,
): Promise<SyncSummary & { remaining: number }> {
  const { db } = deps;
  const now = Date.now();
  await db.run(sql`
    INSERT INTO ${recipeSearchIndex} (recipeId, userId, status, attempts)
    SELECT ${recipe.id}, ${recipe.userId}, 'pending', 0 FROM ${recipe}
    -- SQLite needs a WHERE before ON CONFLICT to parse INSERT ... SELECT.
    WHERE true
    ON CONFLICT (recipeId) DO UPDATE SET
      status = 'pending', attempts = 0, lastError = NULL,
      contentHash = NULL, updatedAt = ${now}
  `);
  return syncNextBatch(deps, batchSize);
}

/** Admin: process the next batch of pending rows across all users. */
export async function syncNextBatch(
  deps: RecipeIndexDeps,
  batchSize = DEFAULT_SYNC_BATCH_SIZE,
): Promise<SyncSummary & { remaining: number }> {
  const { db } = deps;
  const retryable = and(
    inArray(recipeSearchIndex.status, ["pending", "failed"]),
    sql`${recipeSearchIndex.attempts} < ${MAX_SYNC_ATTEMPTS}`,
  );
  const pending = await db
    .select({ id: recipeSearchIndex.recipeId })
    .from(recipeSearchIndex)
    .where(retryable)
    .limit(batchSize);
  const summary = await syncRecipes(
    deps,
    pending.map((row) => row.id),
  );
  const [{ remaining } = { remaining: 0 }] = await db
    .select({ remaining: sql<number>`count(*)` })
    .from(recipeSearchIndex)
    .where(retryable);
  return { ...summary, remaining };
}

/**
 * Remove every AI Search item and index row for a user. Not wired up yet:
 * the app has no account deletion flow. Call it from that flow when added.
 */
export async function deleteUserSearchIndex(
  deps: RecipeIndexDeps,
  userId: string,
): Promise<{ deleted: number; failed: number }> {
  const { db, instance } = deps;
  const rows = await db
    .select({ recipeId: recipeSearchIndex.recipeId, itemId: recipeSearchIndex.itemId })
    .from(recipeSearchIndex)
    .where(eq(recipeSearchIndex.userId, userId));
  let deleted = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await deleteRemoteItem(instance, row.itemId);
      await db
        .delete(recipeSearchIndex)
        .where(eq(recipeSearchIndex.recipeId, row.recipeId));
      deleted++;
    } catch {
      failed++;
    }
  }
  return { deleted, failed };
}

export type WaitUntil = (promise: Promise<unknown>) => void;

/**
 * Call after any write that changes a recipe's searchable content. Marks the
 * recipes dirty, then uploads them in the background. Never throws: search
 * indexing must not fail the user's write. Only the first batch is uploaded
 * inline; anything left pending is picked up
 * by `syncPendingForUser` on the next search, or by an admin reindex.
 */
export async function queueRecipeIndexSync(
  db: Db,
  env: SearchEnv,
  waitUntil: WaitUntil | undefined,
  recipeIds: readonly string[],
): Promise<void> {
  const ids = [...new Set(recipeIds)];
  if (ids.length === 0) return;
  try {
    await markRecipesDirty(db, ids);
  } catch (error) {
    console.error(
      JSON.stringify({ message: "Failed to mark recipes for search sync", error: errorMessage(error) }),
    );
    return;
  }
  const instance = getRecipeSearchInstance(env);
  if (!instance || !waitUntil) return;
  // Bulk changes (e.g. a global ingredient rename) stay pending past one batch.
  waitUntil(
    syncRecipes({ db, instance }, ids.slice(0, DEFAULT_SYNC_BATCH_SIZE)).catch((error) => {
      console.error(
        JSON.stringify({ message: "Background search sync failed", error: errorMessage(error) }),
      );
    }),
  );
}
