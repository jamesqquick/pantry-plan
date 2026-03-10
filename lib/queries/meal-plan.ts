import { getDb } from "@/lib/db";
import { parseDateString } from "@/lib/meal-plan/week-dates";
import type { MealSlot } from "@/features/meal-plan/meal-plan.schemas";

export type PlannedMealRow = {
  id: string;
  date: Date;
  mealSlot: MealSlot;
  recipeId: string | null;
  customLabel: string | null;
  servings: number | null;
  recipe: { id: string; title: string } | null;
};

export async function getPlannedMealsForWeek(
  userId: string,
  weekStart: string,
): Promise<PlannedMealRow[]> {
  const start = parseDateString(weekStart);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);

  const db = getDb();
  const rows = await db.plannedMeal.findMany({
    where: {
      userId,
      date: { gte: start, lt: end },
    },
    include: {
      recipe: { select: { id: true, title: true } },
    },
    orderBy: [{ date: "asc" }, { mealSlot: "asc" }],
  });

  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    mealSlot: r.mealSlot as MealSlot,
    recipeId: r.recipeId,
    customLabel: r.customLabel,
    servings: r.servings,
    recipe: r.recipe,
  }));
}
