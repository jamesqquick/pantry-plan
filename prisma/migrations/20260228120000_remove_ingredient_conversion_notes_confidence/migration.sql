-- Remove conversionNotes and conversionConfidence from Ingredient
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Ingredient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "category" TEXT,
    "defaultUnit" TEXT,
    "costBasisUnit" TEXT NOT NULL,
    "estimatedCentsPerBasisUnit" REAL,
    "gramsPerCup" REAL,
    "cupsPerEach" REAL,
    "preferredDisplayUnit" TEXT NOT NULL DEFAULT 'AUTO',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Ingredient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Ingredient" ("id", "userId", "name", "normalizedName", "category", "defaultUnit", "costBasisUnit", "estimatedCentsPerBasisUnit", "gramsPerCup", "cupsPerEach", "preferredDisplayUnit", "notes", "createdAt", "updatedAt")
SELECT "id", "userId", "name", "normalizedName", "category", "defaultUnit", "costBasisUnit", "estimatedCentsPerBasisUnit", "gramsPerCup", "cupsPerEach", "preferredDisplayUnit", "notes", "createdAt", "updatedAt" FROM "Ingredient";
DROP TABLE "Ingredient";
ALTER TABLE "new_Ingredient" RENAME TO "Ingredient";
PRAGMA foreign_key_check("Ingredient");
PRAGMA foreign_keys=ON;

CREATE UNIQUE INDEX "Ingredient_userId_normalizedName_key" ON "Ingredient"("userId", "normalizedName");
CREATE INDEX "Ingredient_userId_name_idx" ON "Ingredient"("userId", "name");
