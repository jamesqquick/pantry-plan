import { index, sqliteTable, text, uniqueIndex, integer } from "drizzle-orm/sqlite-core";
import { cuidPk, createdAt } from "./_shared";
import { user } from "./users";

export const mcpApiKey = sqliteTable(
  "McpApiKey",
  {
    id: cuidPk(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyHash: text("keyHash").notNull(),
    keyPrefix: text("keyPrefix").notNull(),
    lastUsedAt: integer("lastUsedAt", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("McpApiKey_keyHash_key").on(table.keyHash),
    index("McpApiKey_userId_idx").on(table.userId),
  ],
);

export type McpApiKey = typeof mcpApiKey.$inferSelect;
