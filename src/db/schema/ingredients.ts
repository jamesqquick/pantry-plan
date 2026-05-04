import {
  sqliteTable,
  text,
  real,
  index,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";
import { cuidPk, createdAt, updatedAt } from "./_shared";
import { user } from "./users";
import type {
  CostBasisUnit,
  IngredientDisplayUnit,
  IngredientUnit,
} from "./enums";

/**
 * Global ingredient taxonomy: category → subcategory.
 * Used for display grouping + AI category inference.
 */
export const ingredientCategory = sqliteTable(
  "IngredientCategory",
  {
    id: cuidPk(),
    name: text("name").notNull(),
  },
  (t) => [
    uniqueIndex("IngredientCategory_name_key").on(t.name),
    index("IngredientCategory_name_idx").on(t.name),
  ]
);

export const ingredientSubcategory = sqliteTable(
  "IngredientSubcategory",
  {
    id: cuidPk(),
    name: text("name").notNull(),
    ingredientCategoryId: text("ingredientCategoryId")
      .notNull()
      .references(() => ingredientCategory.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("IngredientSubcategory_categoryId_name_key").on(
      t.ingredientCategoryId,
      t.name
    ),
    index("IngredientSubcategory_categoryId_idx").on(t.ingredientCategoryId),
  ]
);

/**
 * Per-user ingredient catalog (plus global base rows where userId is NULL).
 * Derived rows reference a base via `baseIngredientId` (self-relation).
 */
export const ingredient = sqliteTable(
  "Ingredient",
  {
    id: cuidPk(),
    userId: text("userId").references(() => user.id, { onDelete: "set null" }),
    baseIngredientId: text("baseIngredientId").references(
      (): AnySQLiteColumn => ingredient.id,
      { onDelete: "set null" }
    ),
    name: text("name").notNull(),
    normalizedName: text("normalizedName").notNull(),
    category: text("category"),
    subcategory: text("subcategory").notNull().default(""),
    defaultUnit: text("defaultUnit").$type<IngredientUnit>(),
    costBasisUnit: text("costBasisUnit").notNull().$type<CostBasisUnit>(),
    estimatedCentsPerBasisUnit: real("estimatedCentsPerBasisUnit"),
    /**
     * Prisma had `Decimal?` here; SQLite has no Decimal type, Prisma stored it as DECIMAL
     * text. Drizzle's `real` is fine for grams-per-cup density (precision is not a concern).
     */
    gramsPerCup: real("gramsPerCup"),
    conversionConfidence: text("conversionConfidence").notNull().default("Medium"),
    costConfidence: text("costConfidence").notNull().default("Medium"),
    cupsPerEach: real("cupsPerEach"),
    preferredDisplayUnit: text("preferredDisplayUnit")
      .notNull()
      .default("AUTO")
      .$type<IngredientDisplayUnit>(),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("Ingredient_userId_normalizedName_key").on(
      t.userId,
      t.normalizedName
    ),
    index("Ingredient_userId_idx").on(t.userId),
    index("Ingredient_baseIngredientId_idx").on(t.baseIngredientId),
    index("Ingredient_category_idx").on(t.category),
    index("Ingredient_category_subcategory_idx").on(t.category, t.subcategory),
  ]
);

/**
 * Learned aliases for ingredient matching during import.
 * `aliasNormalized` is globally unique (matches Prisma schema).
 */
export const ingredientAlias = sqliteTable(
  "IngredientAlias",
  {
    id: cuidPk(),
    ingredientId: text("ingredientId")
      .notNull()
      .references(() => ingredient.id, { onDelete: "cascade" }),
    aliasNormalized: text("aliasNormalized").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("IngredientAlias_aliasNormalized_key").on(t.aliasNormalized),
    index("IngredientAlias_ingredientId_idx").on(t.ingredientId),
  ]
);

export type Ingredient = typeof ingredient.$inferSelect;
export type NewIngredient = typeof ingredient.$inferInsert;
