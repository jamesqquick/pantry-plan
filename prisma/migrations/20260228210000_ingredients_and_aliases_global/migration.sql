-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Ingredient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "category" TEXT,
    "subcategory" TEXT NOT NULL DEFAULT '',
    "defaultUnit" TEXT,
    "costBasisUnit" TEXT NOT NULL,
    "estimatedCentsPerBasisUnit" REAL,
    "gramsPerCup" DECIMAL,
    "conversionConfidence" TEXT NOT NULL DEFAULT 'Medium',
    "costConfidence" TEXT NOT NULL DEFAULT 'Medium',
    "cupsPerEach" REAL,
    "preferredDisplayUnit" TEXT NOT NULL DEFAULT 'AUTO',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Ingredient" ("category", "conversionConfidence", "costBasisUnit", "costConfidence", "createdAt", "cupsPerEach", "defaultUnit", "estimatedCentsPerBasisUnit", "gramsPerCup", "id", "name", "normalizedName", "notes", "preferredDisplayUnit", "subcategory", "updatedAt") SELECT "category", "conversionConfidence", "costBasisUnit", "costConfidence", "createdAt", "cupsPerEach", "defaultUnit", "estimatedCentsPerBasisUnit", "gramsPerCup", "id", "name", "normalizedName", "notes", "preferredDisplayUnit", "subcategory", "updatedAt" FROM "Ingredient";
DROP TABLE "Ingredient";
ALTER TABLE "new_Ingredient" RENAME TO "Ingredient";
CREATE INDEX "Ingredient_category_idx" ON "Ingredient"("category");
CREATE INDEX "Ingredient_category_subcategory_idx" ON "Ingredient"("category", "subcategory");
CREATE UNIQUE INDEX "Ingredient_normalizedName_key" ON "Ingredient"("normalizedName");
CREATE TABLE "new_IngredientAlias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ingredientId" TEXT NOT NULL,
    "aliasNormalized" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IngredientAlias_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_IngredientAlias" ("aliasNormalized", "createdAt", "id", "ingredientId") SELECT "aliasNormalized", "createdAt", "id", "ingredientId" FROM "IngredientAlias";
DROP TABLE "IngredientAlias";
ALTER TABLE "new_IngredientAlias" RENAME TO "IngredientAlias";
CREATE INDEX "IngredientAlias_ingredientId_idx" ON "IngredientAlias"("ingredientId");
CREATE UNIQUE INDEX "IngredientAlias_aliasNormalized_key" ON "IngredientAlias"("aliasNormalized");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
