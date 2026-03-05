-- DropIndex
DROP INDEX IF EXISTS "RecipeIngredient_nameNormalized_idx";

-- RedefineTables
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
    CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RecipeIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_RecipeIngredient" ("id", "recipeId", "ingredientId", "quantity", "quantityWhole", "quantityFraction", "rawQuantityText", "unit", "displayText", "isLineTextOverridden", "rawText", "normalizedKey", "sortOrder", "originalQuantity", "originalUnit", "weightGrams", "conversionSource", "conversionConfidence", "conversionNotes", "parseConfidence", "createdAt", "updatedAt") SELECT "id", "recipeId", "ingredientId", "quantity", "quantityWhole", "quantityFraction", "rawQuantityText", "unit", "displayText", "isLineTextOverridden", "rawText", "normalizedKey", "sortOrder", "originalQuantity", "originalUnit", "weightGrams", "conversionSource", "conversionConfidence", "conversionNotes", "parseConfidence", "createdAt", "updatedAt" FROM "RecipeIngredient";
DROP TABLE "RecipeIngredient";
ALTER TABLE "new_RecipeIngredient" RENAME TO "RecipeIngredient";
PRAGMA foreign_key_check("RecipeIngredient");
PRAGMA foreign_keys=ON;

-- CreateIndex
CREATE INDEX "RecipeIngredient_recipeId_sortOrder_idx" ON "RecipeIngredient"("recipeId", "sortOrder");

-- CreateIndex
CREATE INDEX "RecipeIngredient_ingredientId_idx" ON "RecipeIngredient"("ingredientId");
