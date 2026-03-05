-- Replace originalLine, importText, lineText with single displayText column.
-- Backfill: displayText = lineText if set, else originalLine (preserves current display).
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
    "parseNotes" TEXT,
    "changeType" TEXT,
    "baseRecipeIngredientId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecipeIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RecipeIngredient_baseRecipeIngredientId_fkey" FOREIGN KEY ("baseRecipeIngredientId") REFERENCES "RecipeIngredient" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_RecipeIngredient" ("baseRecipeIngredientId", "changeType", "conversionConfidence", "conversionNotes", "conversionSource", "createdAt", "displayText", "id", "ingredientId", "isLineTextOverridden", "nameNormalized", "normalizedKey", "originalQuantity", "originalUnit", "parseConfidence", "parseNotes", "quantity", "quantityFraction", "quantityWhole", "rawQuantityText", "rawText", "recipeId", "sortOrder", "unit", "updatedAt", "weightGrams")
SELECT "baseRecipeIngredientId", "changeType", "conversionConfidence", "conversionNotes", "conversionSource", "createdAt", COALESCE(NULLIF(trim("lineText"), ''), "originalLine"), "id", "ingredientId", "isLineTextOverridden", "nameNormalized", "normalizedKey", "originalQuantity", "originalUnit", "parseConfidence", "parseNotes", "quantity", "quantityFraction", "quantityWhole", "rawQuantityText", "rawText", "recipeId", "sortOrder", "unit", "updatedAt", "weightGrams" FROM "RecipeIngredient";
DROP TABLE "RecipeIngredient";
ALTER TABLE "new_RecipeIngredient" RENAME TO "RecipeIngredient";
CREATE INDEX "RecipeIngredient_recipeId_sortOrder_idx" ON "RecipeIngredient"("recipeId", "sortOrder");
CREATE INDEX "RecipeIngredient_recipeId_changeType_idx" ON "RecipeIngredient"("recipeId", "changeType");
CREATE INDEX "RecipeIngredient_baseRecipeIngredientId_idx" ON "RecipeIngredient"("baseRecipeIngredientId");
CREATE INDEX "RecipeIngredient_ingredientId_idx" ON "RecipeIngredient"("ingredientId");
CREATE INDEX "RecipeIngredient_nameNormalized_idx" ON "RecipeIngredient"("nameNormalized");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
