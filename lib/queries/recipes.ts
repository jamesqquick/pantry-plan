import { getDb } from "@/lib/db";
import type { RecipeListRecipe } from "@/components/recipes/recipe-list-recipe-card";

const recipeIngredientInclude = {
  ingredient: {
    select: {
      id: true,
      name: true,
      userId: true,
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

export async function getRecipesUsingIngredientForUser(
  ingredientId: string,
  userId: string
): Promise<RecipeListRecipe[]> {
  const db = getDb();
  const recipes = await db.recipe.findMany({
    where: {
      userId,
      recipeIngredients: {
        some: { ingredientId },
      },
    },
    orderBy: [{ lastViewedAt: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      title: true,
      sourceUrl: true,
      imageUrl: true,
      servings: true,
      prepTimeMinutes: true,
      cookTimeMinutes: true,
      totalTimeMinutes: true,
      lastViewedAt: true,
      createdAt: true,
      updatedAt: true,
      recipeTags: {
        select: { tag: { select: { id: true, name: true } } },
      },
    },
  });

  return recipes.map((r) => ({
    id: r.id,
    title: r.title,
    sourceUrl: r.sourceUrl,
    imageUrl: r.imageUrl,
    servings: r.servings,
    prepTimeMinutes: r.prepTimeMinutes,
    cookTimeMinutes: r.cookTimeMinutes,
    totalTimeMinutes: r.totalTimeMinutes,
    lastViewedAt: r.lastViewedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    tags: r.recipeTags.map((rt) => rt.tag),
  }));
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

/** Update recipe lastViewedAt for "recently viewed" sort. Call when user views the recipe page.
 * Uses raw SQL so updatedAt is not touched—"Recently updated" should reflect edits, not views. */
export async function recordRecipeView(recipeId: string, userId: string) {
  const db = getDb();
  const now = new Date();
  await db.$executeRaw`
    UPDATE Recipe SET lastViewedAt = ${now}
    WHERE id = ${recipeId} AND userId = ${userId}
  `;
}

/** Convert Prisma recipe to plain object safe for Client Components (no Decimal). */
export function serializeRecipeForClient(
  recipe: NonNullable<RecipeWithIngredients>
) {
  type Row = NonNullable<RecipeWithIngredients>;
  type IngredientRow = Row["recipeIngredients"][number];
  return {
    ...recipe,
    recipeIngredients: recipe.recipeIngredients.map((ri: IngredientRow) => ({
      ...ri,
      ingredient: ri.ingredient
        ? {
            ...ri.ingredient,
            gramsPerCup:
              ri.ingredient.gramsPerCup != null
                ? Number(ri.ingredient.gramsPerCup)
                : null,
          }
        : null,
    })),
  };
}

/** Client-safe recipe (Decimal fields converted to number). Use when passing recipe to Client Components. */
export type RecipeWithIngredientsSerialized = ReturnType<
  typeof serializeRecipeForClient
>;

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

