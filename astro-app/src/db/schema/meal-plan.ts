import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { cuidPk, createdAt, updatedAt } from "./_shared";
import { user } from "./users";
import { recipe } from "./recipes";
import type { MealSlot } from "./enums";

export const plannedMeal = sqliteTable(
  "PlannedMeal",
  {
    id: cuidPk(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** UTC day only — stored as a timestamp at midnight UTC. */
    date: integer("date", { mode: "timestamp_ms" }).notNull(),
    mealSlot: text("mealSlot").notNull().$type<MealSlot>(),
    recipeId: text("recipeId").references(() => recipe.id, {
      onDelete: "cascade",
    }),
    customLabel: text("customLabel"),
    servings: integer("servings"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("PlannedMeal_userId_date_idx").on(t.userId, t.date)]
);

export type PlannedMeal = typeof plannedMeal.$inferSelect;
