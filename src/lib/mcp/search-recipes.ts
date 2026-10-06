import { and, eq, inArray, sql } from "drizzle-orm";
import { recipe, tag } from "@/db";
import type { Db } from "@/db";
import {
  searchUserRecipes,
  type RecipeSearchMode,
  type SearchUserRecipesDeps,
} from "@/lib/search/recipe-search";
import { TagNotFoundError } from "./recipe-errors";

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

export type SearchRecipesInput = {
  query: string;
  limit: number;
  tag?: string;
};

export type SearchRecipesOutput = {
  recipes: RecipeSearchResult[];
  mode: RecipeSearchMode;
};

/** Exact name first; tag names are only unique case-sensitively. */
async function resolveTagId(db: Db, userId: string, name: string): Promise<string> {
  const trimmed = name.trim();
  const rows = await db
    .select({ id: tag.id, name: tag.name })
    .from(tag)
    .where(and(eq(tag.userId, userId), sql`lower(${tag.name}) = lower(${trimmed})`));
  const match = rows.find((row) => row.name === trimmed) ?? rows[0];
  if (!match) throw new TagNotFoundError(trimmed);
  return match.id;
}

export async function searchRecipes(
  deps: SearchUserRecipesDeps,
  userId: string,
  { query, limit, tag: tagName }: SearchRecipesInput,
): Promise<SearchRecipesOutput> {
  const { db } = deps;
  const tagId = tagName ? await resolveTagId(db, userId, tagName) : null;
  const { ids, mode } = await searchUserRecipes(deps, userId, { query, tagId, limit });
  if (ids.length === 0) return { recipes: [], mode };

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
    .where(and(eq(recipe.userId, userId), inArray(recipe.id, ids)));
  const byId = new Map(rows.map((row) => [row.id, row]));

  return {
    recipes: ids
      .map((id) => byId.get(id))
      .filter((result): result is RecipeSearchResult => result !== undefined),
    mode,
  };
}
