import { getDb } from "@/lib/db";

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

export type RecipeWithIngredients = Awaited<
  ReturnType<typeof getRecipeWithIngredientsForUser>
>;

export async function getRecipeWithIngredientsForUser(
  recipeId: string,
  userId: string
) {
  const db = getDb();
  return db.recipe.findFirst({
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
}

/** Fetch multiple recipes with ingredients (for order grocery list). */
export async function getRecipesWithIngredientsForUser(
  recipeIds: string[],
  userId: string
) {
  if (recipeIds.length === 0) return [];

  const db = getDb();
  const results = await db.recipe.findMany({
    where: { id: { in: recipeIds }, userId },
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

  // Convert Prisma Decimal fields to plain numbers for downstream consumers
  type RecipeRow = (typeof results)[number];
  type RecipeIngredientRow = RecipeRow["recipeIngredients"][number];
  return results.map((r: RecipeRow) => ({
    ...r,
    recipeIngredients: r.recipeIngredients.map((ri: RecipeIngredientRow) => ({
      ...ri,
      ingredient: ri.ingredient
        ? {
            ...ri.ingredient,
            gramsPerCup: ri.ingredient.gramsPerCup != null ? Number(ri.ingredient.gramsPerCup) : null,
          }
        : null,
    })),
  }));
}

