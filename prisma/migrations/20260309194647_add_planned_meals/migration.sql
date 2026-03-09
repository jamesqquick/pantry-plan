-- CreateTable
CREATE TABLE "PlannedMeal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "mealSlot" TEXT NOT NULL,
    "recipeId" TEXT,
    "customLabel" TEXT,
    "servings" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlannedMeal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlannedMeal_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PlannedMeal_userId_date_idx" ON "PlannedMeal"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "PlannedMeal_userId_date_mealSlot_key" ON "PlannedMeal"("userId", "date", "mealSlot");
