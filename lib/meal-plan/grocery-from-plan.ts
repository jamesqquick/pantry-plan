/**
 * Build grocery list from planned recipe-based meals for a week (server-only).
 */
import type { IngredientUnit } from "@/generated/prisma/client";
import { getPlannedMealsForWeek } from "@/lib/queries/meal-plan";
import { getRecipesWithIngredientsForUser } from "@/lib/queries/recipes";
import {
  buildGroceryList,
  type GroceryListResult,
} from "@/lib/grocery/aggregate";

export type MealPlanGroceryInput = {
  userId: string;
  weekStart: string;
};

/**
 * Returns grocery list for the given week from recipe-based planned meals.
 * Custom meals are excluded. Uses recipe default servings when planned meal has no servings.
 */
export async function getGroceryListFromPlan(
  input: MealPlanGroceryInput,
): Promise<GroceryListResult | null> {
  const planned = await getPlannedMealsForWeek(input.userId, input.weekStart);
  const recipeMeals = planned.filter(
    (p) => p.recipeId != null && p.recipe != null,
  );
  if (recipeMeals.length === 0) return null;

  const recipeIds = [...new Set(recipeMeals.map((p) => p.recipeId!))];
  const recipesWithIngredients = await getRecipesWithIngredientsForUser(
    recipeIds,
    input.userId,
  );

  type RecipeRow = (typeof recipesWithIngredients)[number];
  type RecipeIngredientRow = RecipeRow["recipeIngredients"][number];
  const recipes = recipesWithIngredients.map((r: RecipeRow) => ({
    id: r.id,
    title: r.title,
    ingredients: r.recipeIngredients.map((ri: RecipeIngredientRow) => ({
      id: ri.id,
      ingredientId: ri.ingredientId,
      ingredient: ri.ingredient
        ? {
            id: ri.ingredient.id,
            name: ri.ingredient.name,
            costBasisUnit: ri.ingredient.costBasisUnit ?? "GRAM",
            estimatedCentsPerBasisUnit:
              ri.ingredient.estimatedCentsPerBasisUnit ?? null,
            gramsPerCup: ri.ingredient.gramsPerCup ?? null,
            cupsPerEach: ri.ingredient.cupsPerEach ?? null,
            preferredDisplayUnit: ri.ingredient.preferredDisplayUnit ?? "AUTO",
          }
        : null,
      quantity: ri.quantity,
      unit: ri.unit as IngredientUnit | null,
      displayText: ri.displayText,
    })),
  }));

  const recipeServingsMap = new Map(
    recipesWithIngredients.map((r: RecipeRow) => [r.id, r.servings ?? 1]),
  );

  const orderItems = recipeMeals.map((p) => {
    const defaultServings = recipeServingsMap.get(p.recipeId!) ?? 1;
    const plannedServings = p.servings ?? defaultServings;
    const batches = Math.max(0.01, plannedServings / defaultServings);
    return { recipeId: p.recipeId!, batches };
  });

  return buildGroceryList({ orderItems, recipes });
}
