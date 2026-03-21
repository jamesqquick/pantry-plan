-- Remove MealPlan: rebuild PlannedMeal with userId from MealPlan for each row.
-- Targets databases that applied 20260309212255_add_meal_plan_entity (MealPlan + mealPlanId).
-- SQLite: table rebuild pattern.

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_PlannedMeal" (
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

INSERT INTO "new_PlannedMeal" ("id", "userId", "date", "mealSlot", "recipeId", "customLabel", "servings", "createdAt", "updatedAt")
SELECT
    "pm"."id",
    "mp"."userId",
    "pm"."date",
    "pm"."mealSlot",
    "pm"."recipeId",
    "pm"."customLabel",
    "pm"."servings",
    "pm"."createdAt",
    "pm"."updatedAt"
FROM "PlannedMeal" AS "pm"
INNER JOIN "MealPlan" AS "mp" ON "mp"."id" = "pm"."mealPlanId";

DROP TABLE "PlannedMeal";
ALTER TABLE "new_PlannedMeal" RENAME TO "PlannedMeal";

CREATE INDEX "PlannedMeal_userId_date_idx" ON "PlannedMeal"("userId", "date");

DROP TABLE "MealPlan";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
