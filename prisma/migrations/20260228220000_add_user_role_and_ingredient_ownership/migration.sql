-- Add User.role (USER/ADMIN)
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("id", "email", "passwordHash", "name", "createdAt", "updatedAt") SELECT "id", "email", "passwordHash", "name", "createdAt", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- Add Ingredient.userId (nullable), unique (userId, normalizedName)
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Ingredient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
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
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Ingredient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Ingredient" ("id", "name", "normalizedName", "category", "subcategory", "defaultUnit", "costBasisUnit", "estimatedCentsPerBasisUnit", "gramsPerCup", "conversionConfidence", "costConfidence", "cupsPerEach", "preferredDisplayUnit", "notes", "createdAt", "updatedAt") SELECT "id", "name", "normalizedName", "category", "subcategory", "defaultUnit", "costBasisUnit", "estimatedCentsPerBasisUnit", "gramsPerCup", "conversionConfidence", "costConfidence", "cupsPerEach", "preferredDisplayUnit", "notes", "createdAt", "updatedAt" FROM "Ingredient";
DROP TABLE "Ingredient";
ALTER TABLE "new_Ingredient" RENAME TO "Ingredient";
CREATE INDEX "Ingredient_userId_idx" ON "Ingredient"("userId");
CREATE INDEX "Ingredient_category_idx" ON "Ingredient"("category");
CREATE INDEX "Ingredient_category_subcategory_idx" ON "Ingredient"("category", "subcategory");
CREATE UNIQUE INDEX "Ingredient_userId_normalizedName_key" ON "Ingredient"("userId", "normalizedName");
-- Enforce at most one global ingredient per normalizedName
CREATE UNIQUE INDEX "Ingredient_global_normalizedName_key" ON "Ingredient"("normalizedName") WHERE "userId" IS NULL;
PRAGMA foreign_keys=ON;