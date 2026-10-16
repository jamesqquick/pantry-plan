import { and, eq, inArray, sql, type SQLWrapper } from "drizzle-orm";
import { ingredient, ingredientAlias, ingredientSearchIndex, type Db, type IngredientSearchIndexRow } from "@/db";
import { chunkInValues } from "@/db/chunked-read";
import {
  buildIngredientDocument,
  hashIngredientDocument,
  ingredientDocumentKey,
  ingredientScopeKey,
  MAX_INGREDIENT_DOCUMENT_ALIASES,
  MAX_INGREDIENT_DOCUMENT_ALIAS_LENGTH,
  MAX_INGREDIENT_DOCUMENT_CATEGORY_LENGTH,
  MAX_INGREDIENT_DOCUMENT_NAME_LENGTH,
  MAX_INGREDIENT_DOCUMENT_NOTES_LENGTH,
  type IngredientDocumentInput,
} from "./ingredient-document";

export const PRODUCTION_INGREDIENT_SEARCH_INSTANCE = "quickpantry-ingredients";
export const MAX_INGREDIENT_SYNC_ATTEMPTS = 5;
/** Both explicit and discovered sync calls process at most this many IDs. */
export const DEFAULT_INGREDIENT_SYNC_BATCH_SIZE = 20;
export const INGREDIENT_RETRY_BASE_DELAY_MS = 60_000;
export const MAX_INGREDIENT_RETRY_DELAY_MS = 86_400_000;
export const INGREDIENT_INDEX_IO_TIMEOUT_MS = 5_000;
export const INGREDIENT_SYNC_BUDGET_MS = 20_000;

export type IngredientSearchInstance = {
  search: AiSearchInstance["search"];
  items: Pick<AiSearchItems, "upload" | "delete" | "list">;
};

export type IngredientSearchEnv = {
  AI_SEARCH?: { get(name: Parameters<AiSearchNamespace["get"]>[0]): IngredientSearchInstance };
  INGREDIENT_AI_SEARCH_INSTANCE?: string;
};

export type IngredientIndexWaitUntil = (promise: Promise<unknown>) => void;
export type IngredientIndexDeps = {
  db: Db;
  instance: IngredientSearchInstance;
  /** Keeps late remote completions attached to the request after an I/O timeout. */
  waitUntil?: IngredientIndexWaitUntil;
};
export type IngredientSyncSummary = { uploaded: number; unchanged: number; deleted: number; failed: number };
export type IngredientBatchSyncSummary = IngredientSyncSummary & { remaining: number };

export class IngredientIndexTimeoutError extends Error {
  constructor(
    public readonly ingredientId: string,
    public readonly operation: "upload" | "delete" | "list" | "load" | "persist",
    public readonly timeoutMs: number,
  ) {
    super(`Ingredient index ${operation} timed out after ${timeoutMs}ms: ${ingredientId}`);
    this.name = "IngredientIndexTimeoutError";
  }
}

export class IngredientIndexLookupError extends Error {
  constructor(public readonly ingredientId: string) {
    super(`Ingredient index lookup returned unexpected items: ${ingredientId}`);
    this.name = "IngredientIndexLookupError";
  }
}

export class IngredientIndexBudgetError extends Error {
  constructor(
    public readonly ingredientId: string,
    public readonly operation: IngredientIndexTimeoutError["operation"],
  ) {
    super(`Ingredient index ${operation} skipped after sync deadline: ${ingredientId}`);
    this.name = "IngredientIndexBudgetError";
  }
}

export function ingredientRetryDelayMs(attempts: number): number {
  return Math.min(MAX_INGREDIENT_RETRY_DELAY_MS, INGREDIENT_RETRY_BASE_DELAY_MS * 4 ** Math.min(8, Math.max(0, attempts - 1)));
}

export function getIngredientSearchInstance(
  env: IngredientSearchEnv,
  isDev: boolean = import.meta.env.DEV,
): IngredientSearchInstance | null {
  const name = env.INGREDIENT_AI_SEARCH_INSTANCE?.trim();
  if (!env.AI_SEARCH || !name) return null;
  if (isDev && name === PRODUCTION_INGREDIENT_SEARCH_INSTANCE) {
    console.error(JSON.stringify({ message: "Refusing the production ingredient AI Search instance in local dev. Set INGREDIENT_AI_SEARCH_INSTANCE to a development instance." }));
    return null;
  }
  return env.AI_SEARCH.get(name);
}

function batchLimit(limit: number): number {
  return Number.isFinite(limit) ? Math.max(0, Math.min(DEFAULT_INGREDIENT_SYNC_BATCH_SIZE, Math.trunc(limit))) : DEFAULT_INGREDIENT_SYNC_BATCH_SIZE;
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

function logSyncError(message: string, error: unknown): void {
  const kind = error instanceof IngredientIndexTimeoutError ? "timeout"
    : error instanceof IngredientIndexBudgetError ? "budget"
    : error instanceof IngredientIndexLookupError ? "lookup" : "operation_failed";
  console.error(JSON.stringify({ message, kind }));
}

async function withTimeout<T>(
  promise: Promise<T>,
  ingredientId: string,
  operation: IngredientIndexTimeoutError["operation"],
  timeoutMs = INGREDIENT_INDEX_IO_TIMEOUT_MS,
  onTimeout?: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          onTimeout?.();
          reject(new IngredientIndexTimeoutError(ingredientId, operation, timeoutMs));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function remainingIoTimeout(ingredientId: string, operation: IngredientIndexTimeoutError["operation"], deadline: number): number {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new IngredientIndexBudgetError(ingredientId, operation);
  return Math.min(INGREDIENT_INDEX_IO_TIMEOUT_MS, remaining);
}

function withDeadline<T>(
  call: () => PromiseLike<T>,
  ingredientId: string,
  operation: IngredientIndexTimeoutError["operation"],
  deadline: number,
): Promise<T> {
  const timeoutMs = remainingIoTimeout(ingredientId, operation, deadline);
  return withTimeout(Promise.resolve().then(() => {
    remainingIoTimeout(ingredientId, operation, deadline);
    return call();
  }), ingredientId, operation, timeoutMs);
}

function retainRecovery(deps: IngredientIndexDeps, promise: Promise<unknown>): void {
  const recovery = promise.catch((error) => logSyncError("Late ingredient index operation failed", error));
  try {
    deps.waitUntil?.(recovery);
  } catch (error) {
    logSyncError("Failed to attach ingredient index completion to waitUntil", error);
  }
}

/** SQL bounds aliases before they cross the D1/Worker boundary. */
function aliasesJson(ingredientId: SQLWrapper) {
  return sql<string>`(
    SELECT json_group_array(alias) FROM (
      SELECT DISTINCT trim(${ingredientAlias.aliasNormalized}) AS alias
      FROM ${ingredientAlias}
      WHERE ${ingredientAlias.ingredientId} = ${ingredientId}
        AND length(trim(${ingredientAlias.aliasNormalized})) BETWEEN 1 AND ${MAX_INGREDIENT_DOCUMENT_ALIAS_LENGTH}
      ORDER BY alias COLLATE BINARY
      LIMIT ${MAX_INGREDIENT_DOCUMENT_ALIASES}
    )
  )`;
}

function documentInputQuery(db: Db, ids: readonly string[]) {
  return db.select({
    id: ingredient.id,
    userId: ingredient.userId,
    name: sql<string>`substr(${ingredient.name}, 1, ${MAX_INGREDIENT_DOCUMENT_NAME_LENGTH + 1})`,
    normalizedName: sql<string>`substr(${ingredient.normalizedName}, 1, ${MAX_INGREDIENT_DOCUMENT_NAME_LENGTH + 1})`,
    category: sql<string | null>`substr(trim(${ingredient.category}), 1, ${MAX_INGREDIENT_DOCUMENT_CATEGORY_LENGTH})`,
    notes: sql<string | null>`substr(trim(${ingredient.notes}), 1, ${MAX_INGREDIENT_DOCUMENT_NOTES_LENGTH})`,
    // Nest the SQL so Drizzle's single-table projection keeps correlated column qualifiers.
    aliasesJson: sql<string>`${aliasesJson(ingredient.id)}`,
  }).from(ingredient).where(inArray(ingredient.id, ids));
}

type DocumentInputRow = Awaited<ReturnType<typeof documentInputQuery>>[number];

function documentInput(row: DocumentInputRow): IngredientDocumentInput {
  const { aliasesJson: serialized, ...input } = row;
  // SQLite generated this array from text values, including [] for no aliases.
  return { ...input, aliases: JSON.parse(serialized) as string[] };
}

export async function loadIngredientDocumentInputs(
  db: Db,
  ingredientIds: readonly string[],
): Promise<Map<string, IngredientDocumentInput>> {
  const inputs = new Map<string, IngredientDocumentInput>();
  const deadline = Date.now() + INGREDIENT_SYNC_BUDGET_MS;
  // Six document-bound parameters leave at least ten slots below D1's 100-variable cap.
  for (const ids of chunkInValues([...new Set(ingredientIds)], 6)) {
    const rows = await withDeadline(() => documentInputQuery(db, ids).all(), ids[0], "load", deadline);
    for (const row of rows) inputs.set(row.id, documentInput(row));
  }
  return inputs;
}

/** Also rejects a deleted/recreated ID whose version counter restarted. */
function liveDocumentMatches(input: IngredientDocumentInput) {
  return sql`EXISTS (
    SELECT 1 FROM ${ingredient}
    WHERE ${ingredient.id} = ${input.id} AND ${ingredient.userId} IS ${input.userId}
      AND ${ingredient.name} = ${input.name} AND ${ingredient.normalizedName} = ${input.normalizedName}
      AND substr(trim(${ingredient.category}), 1, ${MAX_INGREDIENT_DOCUMENT_CATEGORY_LENGTH}) IS ${input.category ?? null}
      AND substr(trim(${ingredient.notes}), 1, ${MAX_INGREDIENT_DOCUMENT_NOTES_LENGTH}) IS ${input.notes ?? null}
      AND ${aliasesJson(ingredient.id)} = ${JSON.stringify(input.aliases)}
  )`;
}

const failedWithoutHash = sql`IngredientSearchIndex.status = 'failed' AND IngredientSearchIndex.contentHash IS NULL`;

async function invalidateAfterUpload(
  db: Db,
  input: IngredientDocumentInput,
  expectedVersion: number,
  itemId: string,
  deadline = Date.now() + INGREDIENT_INDEX_IO_TIMEOUT_MS,
): Promise<void> {
  await withDeadline(() => db.run(sql`
    INSERT INTO ${ingredientSearchIndex} (ingredientId, scopeKey, itemId, status, version)
    VALUES (${input.id}, coalesce(
      (SELECT CASE WHEN userId IS NULL THEN 'global' ELSE 'user:' || userId END FROM ${ingredient} WHERE id = ${input.id}),
      ${ingredientScopeKey(input.userId)}
    ), ${itemId}, 'pending', ${expectedVersion + 1})
    ON CONFLICT (ingredientId) DO UPDATE SET
      scopeKey = coalesce(
        (SELECT CASE WHEN userId IS NULL THEN 'global' ELSE 'user:' || userId END FROM ${ingredient} WHERE id = ${input.id}),
        IngredientSearchIndex.scopeKey
      ),
      itemId = excluded.itemId, contentHash = NULL,
      status = CASE WHEN ${failedWithoutHash} THEN 'failed' ELSE 'pending' END,
      attempts = CASE WHEN ${failedWithoutHash} THEN IngredientSearchIndex.attempts ELSE 0 END,
      nextAttemptAt = CASE WHEN ${failedWithoutHash} THEN IngredientSearchIndex.nextAttemptAt ELSE NULL END,
      lastError = CASE WHEN ${failedWithoutHash} THEN IngredientSearchIndex.lastError ELSE NULL END,
      version = max(IngredientSearchIndex.version + 1, excluded.version), updatedAt = ${Date.now()}
  `), input.id, "persist", deadline);
}

async function invalidateAfterDelete(db: Db, ingredientId: string, deadline = Date.now() + INGREDIENT_INDEX_IO_TIMEOUT_MS): Promise<void> {
  await withDeadline(() => db.update(ingredientSearchIndex).set({
    status: sql`CASE WHEN ${failedWithoutHash} THEN 'failed' ELSE 'pending' END`, contentHash: null,
    attempts: sql`CASE WHEN ${failedWithoutHash} THEN ${ingredientSearchIndex.attempts} ELSE 0 END`,
    nextAttemptAt: sql`CASE WHEN ${failedWithoutHash} THEN ${ingredientSearchIndex.nextAttemptAt} ELSE NULL END`,
    lastError: sql`CASE WHEN ${failedWithoutHash} THEN ${ingredientSearchIndex.lastError} ELSE NULL END`,
    version: sql`${ingredientSearchIndex.version} + 1`,
  }).where(eq(ingredientSearchIndex.ingredientId, ingredientId)).run(), ingredientId, "persist", deadline);
}

async function remoteCall<T>(
  deps: IngredientIndexDeps,
  ingredientId: string,
  operation: "upload" | "delete",
  call: () => Promise<T>,
  onLateCompletion: (value: T) => Promise<void>,
  deadline: number,
  onLateFailure?: (error: unknown) => Promise<void>,
): Promise<T> {
  // Leave one I/O timeout for durable failure state before the shared deadline.
  const workDeadline = deadline - INGREDIENT_INDEX_IO_TIMEOUT_MS;
  const timeoutMs = remainingIoTimeout(ingredientId, operation, workDeadline);
  let timedOut = false;
  const settled = Promise.resolve().then(() => {
    remainingIoTimeout(ingredientId, operation, workDeadline);
    return call();
  }).then(
    (value) => ({ ok: true, value } as const),
    (error: unknown) => ({ ok: false, error } as const),
  );
  retainRecovery(deps, settled.then(async (result) => {
    if (!timedOut && Date.now() < workDeadline) return;
    if (result.ok) await onLateCompletion(result.value);
    else if (!(result.error instanceof IngredientIndexBudgetError)) {
      await onLateFailure?.(result.error);
      throw result.error;
    }
  }));
  const result = await withTimeout(settled, ingredientId, operation, timeoutMs, () => { timedOut = true; });
  if (!result.ok && result.error instanceof IngredientIndexBudgetError) throw result.error;
  if (Date.now() >= workDeadline) throw new IngredientIndexTimeoutError(ingredientId, operation, timeoutMs);
  if (!result.ok) throw result.error;
  return result.value;
}

function isItemNotFound(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "code" in error && error.code === 7041) return true;
  return error instanceof Error && /item_not_found|\bitem\b.*\bnot found\b/i.test(error.message);
}

type FailureState = Pick<IngredientSearchIndexRow, "version" | "status" | "attempts" | "scopeKey" | "itemId" | "contentHash" | "lastError"> & {
  nextAttemptAt: number | null;
  updatedAt: number;
};

async function recordFailure(
  db: Db,
  row: IngredientSearchIndexRow,
  error: unknown,
  ownFailure?: FailureState,
  deadline = Date.now() + INGREDIENT_INDEX_IO_TIMEOUT_MS,
): Promise<FailureState | undefined> {
  const attempts = row.attempts + 1;
  const now = Date.now();
  const current = sql`IngredientSearchIndex.version = ${row.version}
    AND IngredientSearchIndex.status = ${row.status} AND IngredientSearchIndex.attempts = ${row.attempts}
    AND IngredientSearchIndex.itemId IS ${row.itemId} AND IngredientSearchIndex.contentHash IS ${row.contentHash}`;
  // Rejected remote mutations may still have changed content. Invalidate stale
  // acceptances and retain missing tombstones for exact-key recovery.
  // A committed failed/null-hash row keeps its retry state even if its response was lost.
  const [written] = await withDeadline(() => db.all<FailureState>(sql`
    INSERT INTO ${ingredientSearchIndex}
      (ingredientId, scopeKey, itemId, contentHash, status, attempts, version, nextAttemptAt, lastError, indexedAt, updatedAt)
    SELECT ${row.ingredientId}, ${row.scopeKey}, ${row.itemId}, NULL, 'failed',
      ${attempts}, ${row.version + 1}, ${now + ingredientRetryDelayMs(attempts)}, ${errorMessage(error)},
      ${row.indexedAt?.getTime() ?? null}, ${now}
    WHERE EXISTS (SELECT 1 FROM ${ingredientSearchIndex} WHERE ingredientId = ${row.ingredientId})
      OR NOT EXISTS (SELECT 1 FROM ${ingredient} WHERE id = ${row.ingredientId})
    ON CONFLICT (ingredientId) DO UPDATE SET
      status = CASE WHEN ${current} OR ${failedWithoutHash} THEN 'failed' ELSE 'pending' END,
      attempts = CASE WHEN ${current} THEN excluded.attempts
        WHEN ${failedWithoutHash} THEN IngredientSearchIndex.attempts ELSE 0 END,
      lastError = CASE WHEN ${current} THEN excluded.lastError
        WHEN ${failedWithoutHash} THEN IngredientSearchIndex.lastError ELSE NULL END,
      nextAttemptAt = CASE WHEN ${current} THEN excluded.nextAttemptAt
        WHEN ${failedWithoutHash} THEN IngredientSearchIndex.nextAttemptAt ELSE NULL END,
      contentHash = NULL,
      version = max(IngredientSearchIndex.version + 1, excluded.version),
      updatedAt = excluded.updatedAt
    WHERE ${ownFailure ? sql`NOT (
      IngredientSearchIndex.version = ${ownFailure.version} AND IngredientSearchIndex.status = ${ownFailure.status}
      AND IngredientSearchIndex.attempts = ${ownFailure.attempts} AND IngredientSearchIndex.scopeKey = ${ownFailure.scopeKey}
      AND IngredientSearchIndex.itemId IS ${ownFailure.itemId} AND IngredientSearchIndex.contentHash IS ${ownFailure.contentHash}
      AND IngredientSearchIndex.nextAttemptAt IS ${ownFailure.nextAttemptAt} AND IngredientSearchIndex.lastError IS ${ownFailure.lastError}
      AND IngredientSearchIndex.updatedAt = ${ownFailure.updatedAt}
    )` : sql`true`}
    RETURNING version, status, attempts, scopeKey, itemId, contentHash, nextAttemptAt, lastError, updatedAt
  `), row.ingredientId, "persist", deadline);
  return written;
}

function failureRecorder(deps: IngredientIndexDeps, row: IngredientSearchIndexRow, deadline: number) {
  let initial: Promise<FailureState | undefined> | undefined;
  return async (error: unknown, late = false): Promise<void> => {
    const previous = initial;
    const background = late || Date.now() >= deadline;
    const persisted = Promise.resolve().then(async () => {
      // The same operation's late rejection must not erase its own timeout backoff.
      const ownFailure = await previous?.catch(() => undefined);
      return recordFailure(deps.db, row, error, ownFailure,
        background ? Date.now() + INGREDIENT_INDEX_IO_TIMEOUT_MS : deadline);
    });
    if (!previous) initial = persisted;
    if (background && !late) {
      retainRecovery(deps, persisted);
      return;
    }
    await persisted;
  };
}

async function prepareMutation(
  db: Db,
  row: IngredientSearchIndexRow,
  input: IngredientDocumentInput | undefined,
  deadline: number,
): Promise<IngredientSearchIndexRow | undefined> {
  // A lost response or exhausted budget must never leave an old no-op hash usable.
  const [prepared] = await withDeadline(() => db.update(ingredientSearchIndex).set({
    contentHash: null, status: "pending",
  }).where(and(
    eq(ingredientSearchIndex.ingredientId, row.ingredientId), eq(ingredientSearchIndex.version, row.version),
    input ? and(liveDocumentMatches(input), sql`${ingredientSearchIndex.attempts} < ${MAX_INGREDIENT_SYNC_ATTEMPTS}`)
      : sql`NOT EXISTS (SELECT 1 FROM ${ingredient} WHERE ${ingredient.id} = ${row.ingredientId})`,
  )).returning(), row.ingredientId, "persist", deadline);
  return prepared;
}

async function syncTombstone(
  deps: IngredientIndexDeps,
  originalRow: IngredientSearchIndexRow,
  deadline: number,
): Promise<"deleted" | "failed" | null> {
  const { db, instance } = deps;
  let row = originalRow;
  let fail = failureRecorder(deps, row, deadline);
  let remoteDeleted = false;
  const id = row.ingredientId;
  try {
    // An old response may name a deleted item, or a timed-out upload may have
    // succeeded without returning its ID. The stable key recovers the active item.
    const key = ingredientDocumentKey(id);
    const found = await withDeadline(() => instance.items.list({ key, source: "builtin", per_page: 1 }), id, "list",
      deadline - INGREDIENT_INDEX_IO_TIMEOUT_MS);
    if (found.result.length > 1 || found.result.some((item) => item.key !== key)) throw new IngredientIndexLookupError(id);
    const discoveredItemId = found.result[0]?.id;
    if (discoveredItemId && discoveredItemId !== row.itemId) {
      const now = Date.now();
      const [written] = await withDeadline(() => db.all<Pick<IngredientSearchIndexRow, "version" | "scopeKey" | "attempts">>(sql`
        INSERT INTO ${ingredientSearchIndex} (ingredientId, scopeKey, itemId, status, version, attempts, updatedAt)
        SELECT ${id}, ${row.scopeKey}, ${discoveredItemId}, 'pending', ${row.version + 1}, ${row.attempts}, ${now}
        WHERE NOT EXISTS (SELECT 1 FROM ${ingredient} WHERE ${ingredient.id} = ${id})
        ON CONFLICT (ingredientId) DO UPDATE SET
          itemId = excluded.itemId, contentHash = NULL, status = 'pending',
          nextAttemptAt = NULL, lastError = NULL, version = IngredientSearchIndex.version + 1, updatedAt = ${now}
        WHERE IngredientSearchIndex.version = ${row.version}
          AND NOT EXISTS (SELECT 1 FROM ${ingredient} WHERE ${ingredient.id} = ${id})
        RETURNING version, scopeKey, attempts
      `), id, "persist", deadline);
      if (!written) return null;
      row = { ...row, ...written, itemId: discoveredItemId, contentHash: null, status: "pending", nextAttemptAt: null, lastError: null, updatedAt: new Date(now) };
      fail = failureRecorder(deps, row, deadline);
    }

    const itemId = row.itemId;
    if (itemId) {
      const prepared = await prepareMutation(db, row, undefined, deadline);
      if (!prepared) return null;
      row = prepared;
      fail = failureRecorder(deps, row, deadline);
      await remoteCall(deps, id, "delete", async () => {
        try {
          await instance.items.delete(itemId);
        } catch (error) {
          if (!isItemNotFound(error)) throw error;
        }
      }, () => invalidateAfterDelete(db, id), deadline, (error) => fail(error, true));
      remoteDeleted = true;
    }
    const removed = await withDeadline(() => db.delete(ingredientSearchIndex).where(and(
      eq(ingredientSearchIndex.ingredientId, id), eq(ingredientSearchIndex.version, row.version),
      sql`${ingredientSearchIndex.itemId} IS ${row.itemId}`,
      sql`NOT EXISTS (SELECT 1 FROM ${ingredient} WHERE ${ingredient.id} = ${id})`,
    )).returning({ id: ingredientSearchIndex.ingredientId }), id, "persist", deadline);
    if (removed.length > 0) return "deleted";
    await invalidateAfterDelete(db, id, deadline);
    return null;
  } catch (error) {
    if (error instanceof IngredientIndexBudgetError) {
      if (remoteDeleted) retainRecovery(deps, Promise.resolve().then(() => invalidateAfterDelete(db, id)));
      return null;
    }
    await fail(error);
    return "failed";
  }
}

/**
 * Sync one finite batch of explicit IDs. Triggers already marked writes dirty.
 * Missing live states are lazily backfilled; live failures stop at five attempts.
 * Tombstones retry indefinitely with capped backoff, even for deleted owners.
 */
export async function syncIngredients(
  deps: IngredientIndexDeps,
  ingredientIds: readonly string[],
): Promise<IngredientSyncSummary> {
  return syncIngredientsBeforeDeadline(deps, ingredientIds, Date.now() + INGREDIENT_SYNC_BUDGET_MS);
}

async function syncIngredientsBeforeDeadline(
  deps: IngredientIndexDeps,
  ingredientIds: readonly string[],
  deadline: number,
): Promise<IngredientSyncSummary> {
  const { db, instance } = deps;
  const summary: IngredientSyncSummary = { uploaded: 0, unchanged: 0, deleted: 0, failed: 0 };
  const ids = [...new Set(ingredientIds)].slice(0, DEFAULT_INGREDIENT_SYNC_BATCH_SIZE);
  if (ids.length === 0) return summary;
  await withDeadline(() => db.run(sql`
    INSERT INTO ${ingredientSearchIndex} (ingredientId, scopeKey, version)
    SELECT id, CASE WHEN userId IS NULL THEN 'global' ELSE 'user:' || userId END, 1
    FROM ${ingredient} WHERE ${inArray(ingredient.id, ids)}
    ON CONFLICT (ingredientId) DO NOTHING
  `), ids[0], "persist", deadline);
  // D1 batch is atomic, so documents cannot be paired with a newer sync version.
  const [states, inputs] = await withDeadline(() => db.batch([
    db.select().from(ingredientSearchIndex).where(inArray(ingredientSearchIndex.ingredientId, ids)),
    documentInputQuery(db, ids),
  ]), ids[0], "load", deadline);
  const rows = new Map(states.map((row) => [row.ingredientId, row]));
  const documents = new Map(inputs.map((row) => [row.id, documentInput(row)]));

  for (const id of ids) {
    if (Date.now() >= deadline) break;
    let row = rows.get(id);
    const input = documents.get(id);
    if (!row || (row.nextAttemptAt && row.nextAttemptAt.getTime() > Date.now())) continue;
    if (input && row.status === "failed" && row.attempts >= MAX_INGREDIENT_SYNC_ATTEMPTS) continue;
    if (!input) {
      const result = await syncTombstone(deps, row, deadline);
      if (result) summary[result]++;
      continue;
    }
    let uploadedItemId: string | undefined;
    let fail = failureRecorder(deps, row, deadline);
    try {
      const document = buildIngredientDocument(input);
      const contentHash = await hashIngredientDocument(document);
      if (row.itemId && row.contentHash === contentHash) {
        const expectedVersion = row.version;
        const written = await withDeadline(() => db.update(ingredientSearchIndex).set({
          status: "indexed", attempts: 0, lastError: null, nextAttemptAt: null,
        }).where(and(
          eq(ingredientSearchIndex.ingredientId, id), eq(ingredientSearchIndex.version, expectedVersion), liveDocumentMatches(input),
        )).returning({ id: ingredientSearchIndex.ingredientId }), id, "persist", deadline);
        if (written.length > 0) summary.unchanged++;
        continue;
      }

      const prepared = await prepareMutation(db, row, input, deadline);
      if (!prepared) continue;
      row = prepared;
      fail = failureRecorder(deps, row, deadline);
      const expectedVersion = row.version;
      const item = await remoteCall(deps, id, "upload", () => instance.items.upload(document.key, document.content, { metadata: document.metadata }),
        (lateItem) => invalidateAfterUpload(db, input, expectedVersion, lateItem.id), deadline,
        (error) => fail(error, true));
      uploadedItemId = item.id;
      const written = await withDeadline(() => db.update(ingredientSearchIndex).set({
        scopeKey: document.metadata.scope_key, itemId: item.id, contentHash, status: "indexed",
        attempts: 0, lastError: null, nextAttemptAt: null, indexedAt: new Date(),
      }).where(and(
        eq(ingredientSearchIndex.ingredientId, id), eq(ingredientSearchIndex.version, expectedVersion), liveDocumentMatches(input),
      )).returning({ id: ingredientSearchIndex.ingredientId }), id, "persist", deadline);
      if (written.length === 0) await invalidateAfterUpload(db, input, expectedVersion, item.id, deadline);
      summary.uploaded++;
    } catch (error) {
      summary.failed++;
      if (uploadedItemId) {
        const itemId = uploadedItemId;
        const expectedVersion = row.version;
        if (Date.now() >= deadline) retainRecovery(deps, Promise.resolve().then(() => invalidateAfterUpload(db, input, expectedVersion, itemId)));
        else await invalidateAfterUpload(db, input, expectedVersion, itemId, deadline);
      } else if (!(error instanceof IngredientIndexBudgetError)) await fail(error);
    }
  }
  return summary;
}

function candidates(userId?: string, now?: number) {
  const due = now === undefined ? sql`true` : sql`(i.nextAttemptAt IS NULL OR i.nextAttemptAt <= ${now})`;
  const visible = userId === undefined ? sql`true` : sql`(g.userId IS NULL OR g.userId = ${userId})`;
  return sql`
    SELECT i.ingredientId AS id, i.updatedAt AS updatedAt, 0 AS priority
    FROM ${ingredientSearchIndex} i
    WHERE NOT EXISTS (SELECT 1 FROM ${ingredient} g WHERE g.id = i.ingredientId) AND ${due}
    UNION ALL
    SELECT g.id AS id, coalesce(i.updatedAt, g.createdAt) AS updatedAt, 1 AS priority
    FROM ${ingredient} g LEFT JOIN ${ingredientSearchIndex} i ON i.ingredientId = g.id
    WHERE ${visible} AND ${due} AND (
      i.ingredientId IS NULL OR i.status = 'pending'
      OR (i.status = 'failed' AND i.attempts < ${MAX_INGREDIENT_SYNC_ATTEMPTS})
      OR (i.status = 'indexed' AND (i.itemId IS NULL OR i.contentHash IS NULL))
    )
  `;
}

export async function findIngredientsNeedingSync(
  db: Db,
  userId: string,
  limit = DEFAULT_INGREDIENT_SYNC_BATCH_SIZE,
  now = Date.now(),
): Promise<string[]> {
  return findSyncIds(db, userId, limit, now, Date.now() + INGREDIENT_SYNC_BUDGET_MS);
}

async function findSyncIds(db: Db, userId: string, limit: number, now: number, deadline: number): Promise<string[]> {
  const rows = await withDeadline(() => db.all<{ id: string }>(sql`${candidates(userId, now)} ORDER BY priority, updatedAt, id LIMIT ${batchLimit(limit)}`), "batch", "load", deadline);
  return rows.map((row) => row.id);
}

/** Global/current-user live rows plus every due orphan, independent of its owner. */
export async function syncPendingIngredientsForUser(
  deps: IngredientIndexDeps,
  userId: string,
  limit = DEFAULT_INGREDIENT_SYNC_BATCH_SIZE,
): Promise<IngredientSyncSummary> {
  const now = Date.now();
  const deadline = now + INGREDIENT_SYNC_BUDGET_MS;
  return syncIngredientsBeforeDeadline(deps, await findSyncIds(deps.db, userId, limit, now, deadline), deadline);
}

/** Admin: restart exhausted live failures and deletion retries, then sync one batch. */
export async function reindexIngredients(
  deps: IngredientIndexDeps,
  batchSize = DEFAULT_INGREDIENT_SYNC_BATCH_SIZE,
): Promise<IngredientBatchSyncSummary> {
  const deadline = Date.now() + INGREDIENT_SYNC_BUDGET_MS;
  await withDeadline(() => deps.db.update(ingredientSearchIndex).set({
    status: "pending", attempts: 0, lastError: null, nextAttemptAt: null, contentHash: null,
    version: sql`${ingredientSearchIndex.version} + 1`,
  }).run(), "batch", "persist", deadline);
  return syncNextBatchBeforeDeadline(deps, batchSize, deadline);
}

/** Admin: bounded cross-user discovery/backfill. Retry backoff still applies. */
export async function syncNextIngredientBatch(
  deps: IngredientIndexDeps,
  batchSize = DEFAULT_INGREDIENT_SYNC_BATCH_SIZE,
): Promise<IngredientBatchSyncSummary> {
  return syncNextBatchBeforeDeadline(deps, batchSize, Date.now() + INGREDIENT_SYNC_BUDGET_MS);
}

async function syncNextBatchBeforeDeadline(
  deps: IngredientIndexDeps,
  batchSize: number,
  deadline: number,
): Promise<IngredientBatchSyncSummary> {
  const pending = await withDeadline(() => deps.db.all<{ id: string }>(sql`${candidates(undefined, Date.now())} ORDER BY priority, updatedAt, id LIMIT ${batchLimit(batchSize)}`), "batch", "load", deadline);
  const summary = await syncIngredientsBeforeDeadline(deps, pending.map((row) => row.id), deadline);
  // Remaining includes backed-off work, but excludes exhausted live uploads.
  const [{ remaining } = { remaining: 0 }] = await withDeadline(() => deps.db.all<{ remaining: number }>(sql`SELECT count(*) AS remaining FROM (${candidates()})`), "batch", "load", deadline);
  return { ...summary, remaining };
}

/** Post-write nudge only. Catalog triggers already persisted the dirty state. */
export async function queueIngredientIndexSync(
  db: Db,
  env: IngredientSearchEnv,
  waitUntil: IngredientIndexWaitUntil | undefined,
  ingredientIds: readonly string[],
): Promise<void> {
  if (!waitUntil || ingredientIds.length === 0) return;
  try {
    const instance = getIngredientSearchInstance(env);
    if (!instance) return;
    waitUntil(syncIngredients({ db, instance, waitUntil }, ingredientIds).catch((error) => {
      logSyncError("Background ingredient index sync failed", error);
    }));
  } catch (error) {
    logSyncError("Failed to queue ingredient index sync", error);
  }
}
