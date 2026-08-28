import { and, eq, gte, inArray, lt } from "drizzle-orm";
import type { Db } from "@/db";
import { plannedMeal, recipe } from "@/db";
import type { CreateWeeklyMealPlanToolInput } from "@/features/mcp/mcp.schemas";
import {
  getWeekDates,
  getWeekStartString,
  parseDateString,
} from "@/lib/meal-plan/week-dates";

export class WeeklyMealPlanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WeeklyMealPlanValidationError";
  }
}

export async function createWeeklyMealPlan(
  db: Db,
  userId: string,
  input: CreateWeeklyMealPlanToolInput,
) {
  const weekStart = getWeekStartString(parseDateString(input.weekStart));
  const weekDates = new Set(getWeekDates(weekStart));

  if (input.meals.some((meal) => !weekDates.has(meal.date))) {
    throw new WeeklyMealPlanValidationError(
      "Every meal date must belong to weekStart.",
    );
  }

  const recipeIds = [...new Set(input.meals.map((meal) => meal.recipeId))];
  if (recipeIds.length > 0) {
    const ownedRecipes = await db
      .select({ id: recipe.id })
      .from(recipe)
      .where(and(eq(recipe.userId, userId), inArray(recipe.id, recipeIds)));
    if (ownedRecipes.length !== recipeIds.length) {
      throw new WeeklyMealPlanValidationError(
        "One or more recipes do not belong to the user.",
      );
    }
  }

  const startDate = parseDateString(weekStart);
  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + 7);
  const statements = [
    db
      .delete(plannedMeal)
      .where(
        and(
          eq(plannedMeal.userId, userId),
          gte(plannedMeal.date, startDate),
          lt(plannedMeal.date, endDate),
        ),
      ),
    ...input.meals.map((meal) =>
      db.insert(plannedMeal).values({
        userId,
        date: parseDateString(meal.date),
        mealSlot: meal.mealSlot,
        recipeId: meal.recipeId,
        customLabel: null,
        servings: meal.servings ?? null,
      }),
    ),
  ];

  await db.batch(statements as [(typeof statements)[0], ...typeof statements]);
  return { weekStart, mealCount: input.meals.length };
}
