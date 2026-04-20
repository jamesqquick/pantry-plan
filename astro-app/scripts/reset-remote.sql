-- One-time reset: drop everything from remote D1 so we can apply the new
-- 0000_init migration (which includes Better Auth tables + renamed user).
-- Safe because nothing is in production yet.

DROP TABLE IF EXISTS PlannedMeal;
DROP TABLE IF EXISTS OrderItem;
DROP TABLE IF EXISTS "Order";
DROP TABLE IF EXISTS RecipeTag;
DROP TABLE IF EXISTS RecipeIngredient;
DROP TABLE IF EXISTS RecipeInstruction;
DROP TABLE IF EXISTS Recipe;
DROP TABLE IF EXISTS Tag;
DROP TABLE IF EXISTS IngredientAlias;
DROP TABLE IF EXISTS Ingredient;
DROP TABLE IF EXISTS IngredientSubcategory;
DROP TABLE IF EXISTS IngredientCategory;
DROP TABLE IF EXISTS "User";
DROP TABLE IF EXISTS d1_migrations;
