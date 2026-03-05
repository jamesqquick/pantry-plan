import "server-only";
import { getDb } from "@/lib/db";
import { normalizeIngredientName } from "@/lib/ingredients/normalize";
import { stringSimilarity } from "@/lib/ingredients/similarity";

const CANDIDATE_LIMIT = 10;
const FUZZY_THRESHOLD_CANDIDATES = 0.3;

export type DeterministicMatch = {
  match: { id: string; name: string; normalizedName: string };
  matchType: "exact" | "alias";
};

/** Scope: global + user's ingredients. */
function scopeGlobalAndUser(userId: string) {
  return { OR: [{ userId: null }, { userId }] };
}

/**
 * Get deterministic match by exact normalizedName (global or user) or global alias.
 */
export async function getDeterministicMatches(params: {
  normalizedKey: string;
  userId: string;
}): Promise<{ match?: DeterministicMatch["match"]; matchType: "exact" | "alias" | null }> {
  if (!params.normalizedKey.trim()) return { matchType: null };
  const key = params.normalizedKey.trim();
  const db = getDb();

  const ingredient = await db.ingredient.findFirst({
    where: { ...scopeGlobalAndUser(params.userId), normalizedName: key },
    select: { id: true, name: true, normalizedName: true },
  });
  if (ingredient) return { match: ingredient, matchType: "exact" };

  const alias = await db.ingredientAlias.findUnique({
    where: { aliasNormalized: key },
    include: { ingredient: { select: { id: true, name: true, normalizedName: true } } },
  });
  if (alias) return { match: alias.ingredient, matchType: "alias" };

  return { matchType: null };
}

/**
 * Get candidate list: exact + alias first, then fuzzy by token Jaccard similarity (top ~10).
 * Scoped to global + user's ingredients.
 */
export async function getCandidateList(params: {
  normalizedKey: string;
  userId: string;
  limit?: number;
}): Promise<Array<{ id: string; name: string; normalizedName: string; category: string | null; score: number }>> {
  const limit = params.limit ?? CANDIDATE_LIMIT;
  const db = getDb();
  const det = await getDeterministicMatches({ normalizedKey: params.normalizedKey, userId: params.userId });
  if (det.match) {
    const ing = await db.ingredient.findUnique({
      where: { id: det.match.id },
      select: { id: true, name: true, normalizedName: true, category: true },
    });
    if (ing) return [{ ...ing, category: ing.category ?? null, score: 1 }];
  }

  const ingredients = await db.ingredient.findMany({
    where: scopeGlobalAndUser(params.userId),
    select: { id: true, name: true, normalizedName: true, category: true },
  });
  const withScores = ingredients.map((ing) => ({
    ...ing,
    category: ing.category ?? null,
    score: stringSimilarity(params.normalizedKey, ing.normalizedName),
  }));
  withScores.sort((a, b) => b.score - a.score);
  return withScores.filter((c) => c.score >= FUZZY_THRESHOLD_CANDIDATES).slice(0, limit);
}
