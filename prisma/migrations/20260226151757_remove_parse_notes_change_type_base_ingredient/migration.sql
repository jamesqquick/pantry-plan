/*
  Warnings:

  - You are about to drop the column `baseRecipeIngredientId` on the `RecipeIngredient` table. All the data in the column will be lost.
  - You are about to drop the column `changeType` on the `RecipeIngredient` table. All the data in the column will be lost.
  - You are about to drop the column `parseNotes` on the `RecipeIngredient` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RecipeIngredient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipeId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" REAL,
    "quantityWhole" INTEGER,
    "quantityFraction" TEXT,
    "rawQuantityText" TEXT,
    "unit" TEXT,
    "displayText" TEXT NOT NULL,
    "isLineTextOverridden" BOOLEAN NOT NULL DEFAULT false,
    "rawText" TEXT,
    "nameNormalized" TEXT,
    "normalizedKey" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "originalQuantity" REAL,
    "originalUnit" TEXT,
    "weightGrams" REAL,
    "conversionSource" TEXT,
    "conversionConfidence" TEXT,
    "conversionNotes" TEXT,
    "parseConfidence" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecipeIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_RecipeIngredient" ("conversionConfidence", "conversionNotes", "conversionSource", "createdAt", "displayText", "id", "ingredientId", "isLineTextOverridden", "nameNormalized", "normalizedKey", "originalQuantity", "originalUnit", "parseConfidence", "quantity", "quantityFraction", "quantityWhole", "rawQuantityText", "rawText", "recipeId", "sortOrder", "unit", "updatedAt", "weightGrams") SELECT "conversionConfidence", "conversionNotes", "conversionSource", "createdAt", "displayText", "id", "ingredientId", "isLineTextOverridden", "nameNormalized", "normalizedKey", "originalQuantity", "originalUnit", "parseConfidence", "quantity", "quantityFraction", "quantityWhole", "rawQuantityText", "rawText", "recipeId", "sortOrder", "unit", "updatedAt", "weightGrams" FROM "RecipeIngredient";
DROP TABLE "RecipeIngredient";
ALTER TABLE "new_RecipeIngredient" RENAME TO "RecipeIngredient";
CREATE INDEX "RecipeIngredient_recipeId_sortOrder_idx" ON "RecipeIngredient"("recipeId", "sortOrder");
CREATE INDEX "RecipeIngredient_ingredientId_idx" ON "RecipeIngredient"("ingredientId");
CREATE INDEX "RecipeIngredient_nameNormalized_idx" ON "RecipeIngredient"("nameNormalized");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
