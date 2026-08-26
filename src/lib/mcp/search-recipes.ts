import { and, desc, eq, inArray } from "drizzle-orm";
import { recipe } from "@/db";
import type { Db } from "@/db";
import { fuzzyFilterRecipes } from "@/lib/search/fuzzy-recipe";

export type RecipeSearchResult = {
  id: string;
  title: string;
  imageUrl: string | null;
  sourceUrl: string | null;
  servings: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  totalTimeMinutes: number | null;
};

export async function searchRecipes(
  db: Db,
  userId: string,
  query: string,
  limit: number,
): Promise<RecipeSearchResult[]> {
  const titles = await db
    .select({
      id: recipe.id,
      title: recipe.title,
    })
    .from(recipe)
    .where(eq(recipe.userId, userId))
    .orderBy(desc(recipe.updatedAt));

  const matched = fuzzyFilterRecipes(
    titles,
    query,
  );
  const matchedIds = matched.slice(0, limit).map((result) => result.id);
  if (matchedIds.length === 0) return [];

  const rows = await db
    .select({
      id: recipe.id,
      title: recipe.title,
      imageUrl: recipe.imageUrl,
      sourceUrl: recipe.sourceUrl,
      servings: recipe.servings,
      prepTimeMinutes: recipe.prepTimeMinutes,
      cookTimeMinutes: recipe.cookTimeMinutes,
      totalTimeMinutes: recipe.totalTimeMinutes,
    })
    .from(recipe)
    .where(and(eq(recipe.userId, userId), inArray(recipe.id, matchedIds)));
  const byId = new Map(rows.map((row) => [row.id, row]));

  return matchedIds
    .map((id) => byId.get(id)!)
    .filter((result): result is RecipeSearchResult => result !== undefined);
}
