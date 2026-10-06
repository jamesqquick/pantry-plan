import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { updatedAt } from "./_shared";

export const RECIPE_SEARCH_INDEX_STATUSES = [
  "pending",
  "indexed",
  "failed",
] as const;
export type RecipeSearchIndexStatus =
  (typeof RECIPE_SEARCH_INDEX_STATUSES)[number];

/**
 * Sync state between D1 recipes and the AI Search instance.
 *
 * `recipeId` and `userId` intentionally have no foreign keys: when a recipe
 * (or user) is deleted, the row survives as a tombstone that still holds the
 * AI Search `itemId`, so the sync loop can delete the remote item and then
 * drop the row. `indexed` means AI Search accepted the upload; the remote
 * index catches up asynchronously.
 *
 * `version` increments whenever the recipe is marked dirty, so a slow sync
 * cannot overwrite the state written for a newer edit. `nextAttemptAt` backs
 * off retries after failures.
 */
export const recipeSearchIndex = sqliteTable(
  "RecipeSearchIndex",
  {
    recipeId: text("recipeId").primaryKey(),
    userId: text("userId").notNull(),
    itemId: text("itemId"),
    contentHash: text("contentHash"),
    status: text("status")
      .$type<RecipeSearchIndexStatus>()
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("lastError"),
    version: integer("version").notNull().default(0),
    nextAttemptAt: integer("nextAttemptAt", { mode: "timestamp_ms" }),
    indexedAt: integer("indexedAt", { mode: "timestamp_ms" }),
    updatedAt: updatedAt(),
  },
  (t) => [index("RecipeSearchIndex_userId_status_idx").on(t.userId, t.status)]
);

export type RecipeSearchIndexRow = typeof recipeSearchIndex.$inferSelect;
