import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { cuidPk, createdAt, updatedAt } from "./_shared";

/**
 * User — owner of recipes, orders, ingredients, tags, planned meals.
 * `role` stored as TEXT (UserRole union).
 */
export const user = sqliteTable(
  "User",
  {
    id: cuidPk(),
    email: text("email").notNull(),
    passwordHash: text("passwordHash").notNull(),
    name: text("name"),
    role: text("role").notNull().default("USER").$type<"USER" | "ADMIN">(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("User_email_key").on(t.email)]
);

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
