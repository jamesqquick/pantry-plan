import { Suspense } from "react";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getPlannedMealsForWeek } from "@/lib/queries/meal-plan";
import { listRecipesForUser } from "@/lib/queries/recipes";
import { getGroceryListFromPlan } from "@/lib/meal-plan/grocery-from-plan";
import { getWeekDates, getWeekStartString } from "@/lib/meal-plan/week-dates";
import { weekStartSchema } from "@/features/meal-plan/meal-plan.schemas";
import { MealPlanWeekClient } from "@/components/meal-plan/meal-plan-week-client";
import { PageTitle } from "@/components/ui/page-title";
import { GroceryListDisplay } from "@/components/orders/grocery-list-display";
import { GroceryActions } from "@/components/grocery/grocery-actions";
import {
  toDisplayUnits,
  formatCanonicalForKitchen,
  type CanonicalUnit,
  type CanonicalUnitLabel,
} from "@/lib/grocery/display-units";
import type { GroceryLine } from "@/lib/grocery/format";

async function MealPlanWeekData({
  params,
  searchParams,
}: {
  params: Promise<{ weekStart: string }>;
  searchParams: Promise<{ addRecipe?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const [{ weekStart }, { addRecipe }] = await Promise.all([params, searchParams]);

  const parsed = weekStartSchema.safeParse(weekStart);
  if (!parsed.success) notFound();

  const [plannedMeals, recipeOptions, grocery] = await Promise.all([
    getPlannedMealsForWeek(session.user.id, parsed.data),
    listRecipesForUser(session.user.id),
    getGroceryListFromPlan({ userId: session.user.id, weekStart: parsed.data }),
  ]);

  const weekDates = getWeekDates(parsed.data);
  const plannedMealsSerialized = plannedMeals.map((p) => ({
    id: p.id,
    date: p.date instanceof Date ? p.date.toISOString().slice(0, 10) : String(p.date).slice(0, 10),
    mealSlot: p.mealSlot,
    recipeId: p.recipeId,
    customLabel: p.customLabel,
    servings: p.servings,
    recipe: p.recipe,
  }));

  const groceryTotals = grocery?.totals.map((t) => ({
    ingredientId: t.ingredientId,
    name: t.name,
    basisUnit: t.basisUnit,
    basisUnitLabel: t.basisUnitLabel as CanonicalUnitLabel,
    totalBasisQty: t.totalBasisQty,
    estimatedCostCents: t.estimatedCostCents,
    anyOptional: t.anyOptional,
    preferredDisplayUnit: t.preferredDisplayUnit,
    gramsPerCup: t.gramsPerCup != null ? Number(t.gramsPerCup) : null,
    sources: t.sources.map((s) => ({
      recipeId: s.recipeId,
      recipeTitle: s.recipeTitle,
      qty: s.qty,
      unit: s.unit,
      batches: s.batches,
      basisQty: s.basisQty,
    })),
  })) ?? [];

  const groceryLines: GroceryLine[] = grocery
    ? grocery.totals.map((t) => {
        const canonicalUnit: CanonicalUnit =
          t.basisUnit === "CUP" ? "CUP" : t.basisUnit === "EACH" ? "EACH" : "GRAM";
        const display = toDisplayUnits({
          canonicalQty: t.totalBasisQty,
          canonicalUnit,
          ingredient: {
            preferredDisplayUnit: t.preferredDisplayUnit as import("@/lib/grocery/display-units").DisplayPreference,
            gramsPerCup: t.gramsPerCup,
          },
        });
        return {
          name: t.name,
          totalText: display.displayText,
          optional: t.anyOptional,
        };
      })
    : [];

  return (
    <div className="space-y-6">
      <MealPlanWeekClient
        weekStart={parsed.data}
        weekDates={weekDates}
        plannedMeals={plannedMealsSerialized}
        recipeOptions={recipeOptions}
        groceryTotals={groceryTotals}
        groceryLines={groceryLines}
        groceryIssues={grocery?.issues}
        totalEstimatedCostCents={grocery?.totalEstimatedCostCents ?? 0}
        initialAddRecipeId={addRecipe ?? undefined}
      />
    </div>
  );
}

export default function MealPlanWeekPage({
  params,
  searchParams,
}: {
  params: Promise<{ weekStart: string }>;
  searchParams: Promise<{ addRecipe?: string }>;
}) {
  return (
    <Suspense fallback={<div className="animate-pulse rounded-input bg-muted h-64" />}>
      <MealPlanWeekData params={params} searchParams={searchParams} />
    </Suspense>
  );
}
