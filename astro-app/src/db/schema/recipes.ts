import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { cuidPk, createdAt, updatedAt } from "./_shared";
import { user } from "./users";
import { ingredient } from "./ingredients";
import type { IngredientUnit } from "./enums";

export const recipe = sqliteTable(
  "Recipe",
  {
    id: cuidPk(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sourceUrl: text("sourceUrl"),
    imageUrl: text("imageUrl"),
    servings: integer("servings"),
    prepTimeMinutes: integer("prepTimeMinutes"),
    cookTimeMinutes: integer("cookTimeMinutes"),
    totalTimeMinutes: integer("totalTimeMinutes"),
    notes: text("notes"),
    lastViewedAt: integer("lastViewedAt", { mode: "timestamp_ms" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("Recipe_userId_idx").on(t.userId),
    index("Recipe_userId_lastViewedAt_idx").on(t.userId, t.lastViewedAt),
  ]
);

export const recipeInstruction = sqliteTable(
  "RecipeInstruction",
  {
    id: cuidPk(),
    recipeId: text("recipeId")
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    sortOrder: integer("sortOrder").notNull(),
    text: text("text").notNull(),
  },
  (t) => [index("RecipeInstruction_recipeId_sortOrder_idx").on(t.recipeId, t.sortOrder)]
);

export const recipeIngredient = sqliteTable(
  "RecipeIngredient",
  {
    id: cuidPk(),
    recipeId: text("recipeId")
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    /**
     * Optional link to an Ingredient row. Intentionally NOT cascade-deleting
     * (matches Prisma default `ON DELETE NO ACTION`).
     */
    ingredientId: text("ingredientId").references(() => ingredient.id),
    quantity: real("quantity"),
    rawQuantityText: text("rawQuantityText"),
    unit: text("unit").$type<IngredientUnit>(),
    displayText: text("displayText").notNull(),
    rawText: text("rawText"),
    sortOrder: integer("sortOrder").notNull(),
    originalQuantity: real("originalQuantity"),
    originalUnit: text("originalUnit").$type<IngredientUnit>(),
    weightGrams: real("weightGrams"),
    conversionSource: text("conversionSource"),
    conversionConfidence: text("conversionConfidence"),
    conversionNotes: text("conversionNotes"),
    parseConfidence: real("parseConfidence"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("RecipeIngredient_recipeId_sortOrder_idx").on(t.recipeId, t.sortOrder),
    index("RecipeIngredient_ingredientId_idx").on(t.ingredientId),
  ]
);

export type Recipe = typeof recipe.$inferSelect;
export type NewRecipe = typeof recipe.$inferInsert;
