-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RecipeIngredient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipeId" TEXT NOT NULL,
    "ingredientId" TEXT,
    "quantity" REAL,
    "rawQuantityText" TEXT,
    "unit" TEXT,
    "displayText" TEXT NOT NULL,
    "rawText" TEXT,
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
    CONSTRAINT "RecipeIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_RecipeIngredient" ("conversionConfidence", "conversionNotes", "conversionSource", "createdAt", "displayText", "id", "ingredientId", "originalQuantity", "originalUnit", "parseConfidence", "quantity", "rawQuantityText", "rawText", "recipeId", "sortOrder", "unit", "updatedAt", "weightGrams") SELECT "conversionConfidence", "conversionNotes", "conversionSource", "createdAt", "displayText", "id", "ingredientId", "originalQuantity", "originalUnit", "parseConfidence", "quantity", "rawQuantityText", "rawText", "recipeId", "sortOrder", "unit", "updatedAt", "weightGrams" FROM "RecipeIngredient";
DROP TABLE "RecipeIngredient";
ALTER TABLE "new_RecipeIngredient" RENAME TO "RecipeIngredient";
CREATE INDEX "RecipeIngredient_recipeId_sortOrder_idx" ON "RecipeIngredient"("recipeId", "sortOrder");
CREATE INDEX "RecipeIngredient_ingredientId_idx" ON "RecipeIngredient"("ingredientId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
