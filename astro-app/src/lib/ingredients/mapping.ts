/**
 * Deterministic ingredient matching: exact normalizedName, then alias, then fuzzy (Jaccard).
 * Drizzle/D1 port of the Prisma version.
 */

import { and, eq, or, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { ingredient, ingredientAlias } from "@/db/schema/ingredients";
import { stringSimilarity } from "./similarity";

const CANDIDATE_LIMIT = 10;
const FUZZY_THRESHOLD_CANDIDATES = 0.3;

export type DeterministicMatch = {
  match: { id: string; name: string; normalizedName: string };
  matchType: "exact" | "alias";
};

function userScope(userId: string) {
  return or(isNull(ingredient.userId), eq(ingredient.userId, userId));
}

/**
 * Get deterministic match by exact normalizedName (global or user) or global alias.
 */
export async function getDeterministicMatches(
  db: Db,
  params: { normalizedKey: string; userId: string },
): Promise<{
  match?: DeterministicMatch["match"];
  matchType: "exact" | "alias" | null;
}> {
  if (!params.normalizedKey.trim()) return { matchType: null };
  const key = params.normalizedKey.trim();

  // Exact match
  const [exactRow] = await db
    .select({
      id: ingredient.id,
      name: ingredient.name,
      normalizedName: ingredient.normalizedName,
    })
    .from(ingredient)
    .where(
      and(userScope(params.userId), eq(ingredient.normalizedName, key)),
    )
    .limit(1);
  if (exactRow) return { match: exactRow, matchType: "exact" };

  // Alias match
  const [aliasRow] = await db
    .select({
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      ingredientNormalizedName: ingredient.normalizedName,
    })
    .from(ingredientAlias)
    .innerJoin(ingredient, eq(ingredientAlias.ingredientId, ingredient.id))
    .where(eq(ingredientAlias.aliasNormalized, key))
    .limit(1);
  if (aliasRow) {
    return {
      match: {
        id: aliasRow.ingredientId,
        name: aliasRow.ingredientName,
        normalizedName: aliasRow.ingredientNormalizedName,
      },
      matchType: "alias",
    };
  }

  return { matchType: null };
}

/**
 * Get candidate list: exact + alias first, then fuzzy by token Jaccard similarity (top ~10).
 * Scoped to global + user's ingredients.
 */
export async function getCandidateList(
  db: Db,
  params: { normalizedKey: string; userId: string; limit?: number },
): Promise<
  Array<{
    id: string;
    name: string;
    normalizedName: string;
    category: string | null;
    score: number;
  }>
> {
  const limit = params.limit ?? CANDIDATE_LIMIT;

  const det = await getDeterministicMatches(db, {
    normalizedKey: params.normalizedKey,
    userId: params.userId,
  });
  if (det.match) {
    const [ing] = await db
      .select({
        id: ingredient.id,
        name: ingredient.name,
        normalizedName: ingredient.normalizedName,
        category: ingredient.category,
      })
      .from(ingredient)
      .where(eq(ingredient.id, det.match.id))
      .limit(1);
    if (ing)
      return [{ ...ing, category: ing.category ?? null, score: 1 }];
  }

  // Full scan with Jaccard scoring (acceptable for ~500 ingredients)
  const allIngredients = await db
    .select({
      id: ingredient.id,
      name: ingredient.name,
      normalizedName: ingredient.normalizedName,
      category: ingredient.category,
    })
    .from(ingredient)
    .where(userScope(params.userId));

  const withScores = allIngredients.map((ing) => ({
    ...ing,
    category: ing.category ?? null,
    score: stringSimilarity(params.normalizedKey, ing.normalizedName),
  }));
  withScores.sort((a, b) => b.score - a.score);
  return withScores
    .filter((c) => c.score >= FUZZY_THRESHOLD_CANDIDATES)
    .slice(0, limit);
}
