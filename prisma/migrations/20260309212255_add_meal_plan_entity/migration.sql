/*
  Warnings:

  - You are about to drop the column `userId` on the `PlannedMeal` table. All the data in the column will be lost.
  - Added the required column `mealPlanId` to the `PlannedMeal` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "MealPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weekStart" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MealPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PlannedMeal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "mealPlanId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "mealSlot" TEXT NOT NULL,
    "recipeId" TEXT,
    "customLabel" TEXT,
    "servings" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlannedMeal_mealPlanId_fkey" FOREIGN KEY ("mealPlanId") REFERENCES "MealPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlannedMeal_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PlannedMeal" ("createdAt", "customLabel", "date", "id", "mealSlot", "recipeId", "servings", "updatedAt") SELECT "createdAt", "customLabel", "date", "id", "mealSlot", "recipeId", "servings", "updatedAt" FROM "PlannedMeal";
DROP TABLE "PlannedMeal";
ALTER TABLE "new_PlannedMeal" RENAME TO "PlannedMeal";
CREATE INDEX "PlannedMeal_mealPlanId_date_idx" ON "PlannedMeal"("mealPlanId", "date");
CREATE UNIQUE INDEX "PlannedMeal_mealPlanId_date_mealSlot_key" ON "PlannedMeal"("mealPlanId", "date", "mealSlot");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "MealPlan_userId_idx" ON "MealPlan"("userId");
