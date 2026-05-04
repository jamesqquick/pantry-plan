/**
 * Compute ingredient suggestions for raw lines using exact match, alias, and fuzzy
 * (LIKE + Jaccard). No LLM. Returns SuggestionItem[] with candidates and scores.
 *
 * Drizzle/D1 port of the Prisma version from lib/ingredients/compute-suggestions.ts.
 */

import { and, eq, inArray, like, or, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { ingredient, ingredientAlias } from "@/db/schema/ingredients";
import type { IngredientUnit } from "@/db/schema/enums";
import { normalizeIngredientName } from "./normalize";
import { parseIngredientLineForImport } from "./parse-line";
import { stringSimilarity, tokenize } from "./similarity";

/** Tokens to exclude from LIKE query (noise that never appears in ingredient normalizedName). */
const SEARCH_NOISE_TOKENS = new Set(["or", "at", "and", "box"]);

const FUZZY_THRESHOLD_BEST = 0.9;
const FUZZY_THRESHOLD_CANDIDATES = 0.1;
const FUZZY_CANDIDATE_TAKE = 100;

export type SuggestionItem = {
  originalLine: string;
  normalizedKey: string;
  parsed?: {
    quantity: number | null;
    unit: IngredientUnit | null;
    name: string | null;
  };
  parsedText?: string;
  suggestedIngredient?: {
    id: string;
    name: string;
    normalizedName: string;
    matchType: "exact" | "alias" | "fuzzy" | "llm";
  };
  suggestedCreateName?: string;
  candidates?: Array<{
    id: string;
    name: string;
    matchType: "exact" | "alias" | "fuzzy";
    score?: number;
  }>;
};

/** Drizzle WHERE clause: global ingredients (userId IS NULL) OR owned by this user. */
function userScope(userId: string) {
  return or(isNull(ingredient.userId), eq(ingredient.userId, userId));
}

/**
 * Compute ingredient suggestions for raw lines.
 * Candidates have score >= 0.10. Used by URL parse and as input to LLM mapping.
 */
export async function computeIngredientSuggestions(
  db: Db,
  lines: string[],
  userId: string,
): Promise<SuggestionItem[]> {
  const suggestions: SuggestionItem[] = [];
  const keysForAlias = new Set<string>();
  const allNormalizedKeys = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      suggestions.push({ originalLine: line, normalizedKey: "" });
      continue;
    }
    const parsedLine = parseIngredientLineForImport(trimmed);
    const namePart = parsedLine.parsed?.name?.trim() || trimmed;
    const normalizedNamePart = normalizeIngredientName(namePart);
    const item: SuggestionItem = {
      originalLine: line,
      normalizedKey: normalizedNamePart,
      parsed: parsedLine.parsed,
      parsedText: parsedLine.parsedText,
    };
    if (normalizedNamePart) {
      allNormalizedKeys.add(normalizedNamePart);
      keysForAlias.add(normalizedNamePart);
    }
    suggestions.push(item);
  }

  // --- Exact match by normalizedName ---
  // Restrict to user scope (global rows OR rows owned by this user) to prevent
  // suggestions from leaking ingredient ids that belong to other users.
  // When both a global and a user-owned row share a normalized name, prefer the
  // user-owned one.
  const ingredientByNorm: Record<
    string,
    { id: string; name: string; normalizedName: string; userId: string | null }
  > = {};
  if (allNormalizedKeys.size > 0) {
    const exactRows = await db
      .select({
        id: ingredient.id,
        name: ingredient.name,
        normalizedName: ingredient.normalizedName,
        userId: ingredient.userId,
      })
      .from(ingredient)
      .where(
        and(
          inArray(ingredient.normalizedName, Array.from(allNormalizedKeys)),
          userScope(userId),
        ),
      );
    for (const row of exactRows) {
      const existing = ingredientByNorm[row.normalizedName];
      // Prefer user-owned over global on collisions.
      if (!existing || (existing.userId === null && row.userId === userId)) {
        ingredientByNorm[row.normalizedName] = row;
      }
    }
  }

  for (const item of suggestions) {
    if (!item.normalizedKey) continue;
    const exact = ingredientByNorm[item.normalizedKey];
    if (exact) {
      item.suggestedIngredient = {
        id: exact.id,
        name: exact.name,
        normalizedName: exact.normalizedName,
        matchType: "exact",
      };
    }
  }

  // --- Alias match ---
  // Same user-scope restriction as exact match: only resolve aliases that
  // point at a global ingredient or one owned by this user.
  const aliasByNorm: Record<
    string,
    {
      id: string;
      name: string;
      normalizedName: string;
      userId: string | null;
    }
  > = {};
  if (keysForAlias.size > 0) {
    const aliasRows = await db
      .select({
        aliasNormalized: ingredientAlias.aliasNormalized,
        ingredientId: ingredient.id,
        ingredientName: ingredient.name,
        ingredientNormalizedName: ingredient.normalizedName,
        ingredientUserId: ingredient.userId,
      })
      .from(ingredientAlias)
      .innerJoin(ingredient, eq(ingredientAlias.ingredientId, ingredient.id))
      .where(
        and(
          inArray(ingredientAlias.aliasNormalized, Array.from(keysForAlias)),
          userScope(userId),
        ),
      );
    for (const a of aliasRows) {
      const existing = aliasByNorm[a.aliasNormalized];
      // Prefer user-owned over global on collisions.
      if (
        !existing ||
        (existing.userId === null && a.ingredientUserId === userId)
      ) {
        aliasByNorm[a.aliasNormalized] = {
          id: a.ingredientId,
          name: a.ingredientName,
          normalizedName: a.ingredientNormalizedName,
          userId: a.ingredientUserId,
        };
      }
    }
  }

  for (const item of suggestions) {
    if (item.suggestedIngredient || !item.normalizedKey.trim()) continue;

    const aliasByName = aliasByNorm[item.normalizedKey] ?? null;
    if (aliasByName) {
      item.suggestedIngredient = {
        id: aliasByName.id,
        name: aliasByName.name,
        normalizedName: aliasByName.normalizedName,
        matchType: "alias",
      };
      continue;
    }

    // --- Fuzzy match (LIKE + Jaccard) ---
    const rawTokens = tokenize(item.normalizedKey);
    const tokens = rawTokens.filter(
      (t) =>
        t.length >= 2 && !/^\d+$/.test(t) && !SEARCH_NOISE_TOKENS.has(t),
    );
    let fuzzyCandidates: {
      id: string;
      name: string;
      normalizedName: string;
    }[] = [];
    if (tokens.length > 0) {
      const likeConditions = tokens.map((t) =>
        like(ingredient.normalizedName, `%${t}%`),
      );
      fuzzyCandidates = await db
        .select({
          id: ingredient.id,
          name: ingredient.name,
          normalizedName: ingredient.normalizedName,
        })
        .from(ingredient)
        .where(and(userScope(userId), or(...likeConditions)))
        .limit(FUZZY_CANDIDATE_TAKE);
    }

    const withScores = fuzzyCandidates.map((ing) => ({
      ...ing,
      score: stringSimilarity(item.normalizedKey, ing.normalizedName),
    }));
    withScores.sort((a, b) => b.score - a.score);

    const best = withScores[0];
    if (best && best.score >= FUZZY_THRESHOLD_BEST) {
      item.suggestedIngredient = {
        id: best.id,
        name: best.name,
        normalizedName: best.normalizedName,
        matchType: "fuzzy",
      };
    }
    const candidates = withScores
      .filter((c) => c.score >= FUZZY_THRESHOLD_CANDIDATES)
      .slice(0, 5)
      .map((c) => ({
        id: c.id,
        name: c.name,
        matchType: "fuzzy" as const,
        score: c.score,
      }));
    if (candidates.length > 0) item.candidates = candidates;
  }

  return suggestions;
}
