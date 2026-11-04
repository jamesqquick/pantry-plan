import { primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createdAt } from "./_shared";
import { user } from "./users";

export const mutationOperation = sqliteTable(
  "MutationOperation",
  {
    userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
    operationId: text("operationId").notNull(),
    kind: text("kind").notNull(),
    requestHash: text("requestHash").notNull(),
    status: text("status", { enum: ["completed", "cancelled"] }).notNull().default("completed"),
    // Keep the receipt even if the resource is later deleted.
    resourceId: text("resourceId"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.operationId] })],
);
