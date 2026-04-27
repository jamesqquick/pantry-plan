import { index, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { cuidPk, createdAt } from "./_shared";
import { user } from "./users";
import { recipe } from "./recipes";

export const tag = sqliteTable(
  "Tag",
  {
    id: cuidPk(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("Tag_userId_name_key").on(t.userId, t.name),
    index("Tag_userId_idx").on(t.userId),
  ]
);

export const recipeTag = sqliteTable(
  "RecipeTag",
  {
    id: cuidPk(),
    recipeId: text("recipeId")
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    tagId: text("tagId")
      .notNull()
      .references(() => tag.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("RecipeTag_recipeId_tagId_key").on(t.recipeId, t.tagId),
    index("RecipeTag_tagId_idx").on(t.tagId),
  ]
);

export type Tag = typeof tag.$inferSelect;
