import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { updatedAt } from "./_shared";

export const INGREDIENT_SEARCH_INDEX_STATUSES = ["pending", "indexed", "failed"] as const;
export type IngredientSearchIndexStatus = (typeof INGREDIENT_SEARCH_INDEX_STATUSES)[number];

/**
 * No foreign keys: deletion tombstones retain the remote item and owner scope.
 * Catalog/alias triggers increment version transactionally with searchable edits.
 * `indexed` means an upload was accepted, not that retrieval is immediately ready.
 */
export const ingredientSearchIndex = sqliteTable(
  "IngredientSearchIndex",
  {
    ingredientId: text("ingredientId").primaryKey(),
    scopeKey: text("scopeKey").notNull(),
    itemId: text("itemId"),
    contentHash: text("contentHash"),
    status: text("status").$type<IngredientSearchIndexStatus>().notNull().default("pending"),
    version: integer("version").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: integer("nextAttemptAt", { mode: "timestamp_ms" }),
    lastError: text("lastError"),
    indexedAt: integer("indexedAt", { mode: "timestamp_ms" }),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("IngredientSearchIndex_scopeKey_status_idx").on(t.scopeKey, t.status),
    index("IngredientSearchIndex_status_nextAttemptAt_idx").on(t.status, t.nextAttemptAt),
  ],
);

export type IngredientSearchIndexRow = typeof ingredientSearchIndex.$inferSelect;
