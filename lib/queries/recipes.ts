import { getDb } from "@/lib/db";
import type { EffectiveIngredientItem } from "@/lib/recipes/variants";

const recipeIngredientInclude = {
  ingredient: {
    select: {
      id: true,
      name: true,
      defaultUnit: true,
      costBasisUnit: true,
      estimatedCentsPerBasisUnit: true,
      gramsPerCup: true,
      cupsPerEach: true,
      preferredDisplayUnit: true,
    },
  },
} as const;

export async function listRecipesForUser(userId: string) {
  const db = getDb();
  return db.recipe.findMany({
    where: { userId },
    orderBy: { title: "asc" },
    select: { id: true, title: true },
  });
}

export async function getRecipeForUser(recipeId: string, userId: string) {
  const db = getDb();
  return db.recipe.findFirst({
    where: { id: recipeId, userId },
    include: {
      recipeIngredients: {
        orderBy: { sortOrder: "asc" },
        include: {
          ingredient: { select: { id: true, name: true, defaultUnit: true } },
        },
      },
      recipeInstructions: { orderBy: { sortOrder: "asc" } },
      recipeTags: {
        include: { tag: { select: { id: true, name: true } } },
      },
    },
  });
}

export type RecipeWithEffectiveIngredients = Awaited<
  ReturnType<typeof getRecipeWithEffectiveIngredientsForUser>
>;

/** Recipe with effectiveIngredients (this recipe's ingredients). */
export async function getRecipeWithEffectiveIngredientsForUser(
  recipeId: string,
  userId: string
) {
  const db = getDb();
  const recipe = await db.recipe.findFirst({
    where: { id: recipeId, userId },
    include: {
      recipeIngredients: {
        orderBy: { sortOrder: "asc" },
        include: { ingredient: { select: recipeIngredientInclude.ingredient.select } },
      },
      recipeInstructions: { orderBy: { sortOrder: "asc" } },
      recipeTags: {
        include: { tag: { select: { id: true, name: true } } },
      },
    },
  });
  if (!recipe) return null;

  const effectiveIngredients: EffectiveIngredientItem[] = recipe.recipeIngredients.map((ri) => ({
    ...ri,
    source: "base" as const,
    provenance: "base" as const,
    effectiveId: ri.id,
    displayName: ri.ingredient?.name ?? null,
    displayQuantity: ri.quantity,
    displayUnit: ri.unit,
    displayOriginalLine: ri.displayText,
  }));

  return {
    ...recipe,
    effectiveIngredients,
  };
}

/** Fetch multiple recipes with effective ingredients (for order grocery list). */
export async function getRecipesWithEffectiveIngredientsForUser(
  recipeIds: string[],
  userId: string
) {
  const results = await Promise.all(
    recipeIds.map((id) => getRecipeWithEffectiveIngredientsForUser(id, userId))
  );
  return results.filter((r): r is NonNullable<typeof r> => r != null);
}

