-- CreateTable
CREATE TABLE "RecipeInstruction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipeId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    CONSTRAINT "RecipeInstruction_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RecipeInstruction_recipeId_sortOrder_idx" ON "RecipeInstruction"("recipeId", "sortOrder");

-- RedefineTables (drop Recipe.instructions; no data migration)
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Recipe" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "imageUrl" TEXT,
    "servings" INTEGER,
    "prepTimeMinutes" INTEGER,
    "cookTimeMinutes" INTEGER,
    "totalTimeMinutes" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Recipe_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Recipe" ("id", "userId", "title", "sourceUrl", "imageUrl", "servings", "prepTimeMinutes", "cookTimeMinutes", "totalTimeMinutes", "notes", "createdAt", "updatedAt")
SELECT "id", "userId", "title", "sourceUrl", "imageUrl", "servings", "prepTimeMinutes", "cookTimeMinutes", "totalTimeMinutes", "notes", "createdAt", "updatedAt" FROM "Recipe";
DROP TABLE "Recipe";
ALTER TABLE "new_Recipe" RENAME TO "Recipe";
PRAGMA foreign_key_check("Recipe");
PRAGMA foreign_keys=ON;

-- CreateIndex
CREATE INDEX "Recipe_userId_idx" ON "Recipe"("userId");
