/**
 * Compute ingredient suggestions for raw lines using exact match, alias, and fuzzy
 * Jaccard ranking. No LLM. Returns SuggestionItem[] with candidates and scores.
 *
 * Drizzle/D1 port of the Prisma version from lib/ingredients/compute-suggestions.ts.
 */

import { and, eq, inArray, like, or, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { ingredient, ingredientAlias } from "@/db/schema/ingredients";
import type { IngredientUnit } from "@/db/schema/enums";
import { chunkInValues } from "@/db/chunked-read";
import { normalizeIngredientName } from "./normalize";
import { parseIngredientLineForImport } from "./parse-line";
import { stringSimilarity, tokenize } from "./similarity";

const SEARCH_NOISE_TOKENS = new Set(["or", "at", "and", "box"]);
const FUZZY_THRESHOLD_BEST = 0.9;
const FUZZY_THRESHOLD_CANDIDATES = 0.1;
const FUZZY_CANDIDATE_TAKE = 100;
const FUZZY_QUERY_RESULT_TAKE = 500;
export const MAX_SUGGESTION_CANDIDATES = 5;
export const FUZZY_SEARCH_TOKENS_PER_QUERY = 89;
export const MAX_FUZZY_SEARCH_QUERIES = 10;
export const MAX_FUZZY_SEARCH_TOKENS =
  FUZZY_SEARCH_TOKENS_PER_QUERY * MAX_FUZZY_SEARCH_QUERIES;
export const MAX_FUZZY_SEARCH_TOKEN_LENGTH = 48;

type FuzzyCatalogEntry = {
  id: string;
  name: string;
  normalizedName: string;
  userId: string | null;
};

export function rankIngredientCatalogCandidates(
  normalizedKey: string,
  catalog: readonly FuzzyCatalogEntry[],
  userId: string,
): Array<FuzzyCatalogEntry & { score: number }> {
  return catalog
    .map((entry) => ({
      ...entry,
      score: stringSimilarity(normalizedKey, entry.normalizedName),
    }))
    .filter((entry) => entry.score >= FUZZY_THRESHOLD_CANDIDATES)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.userId === userId) - Number(a.userId === userId) ||
        a.normalizedName.localeCompare(b.normalizedName) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, FUZZY_CANDIDATE_TAKE);
}

export function collectFuzzySearchTokens(
  normalizedKeys: readonly string[],
): string[] {
  const tokensByKey = normalizedKeys.map((key) => {
    const seen = new Set<string>();
    return tokenize(key)
      .filter(
        (token) =>
          token.length >= 2 &&
          !/^\d+$/.test(token) &&
          /^[\x00-\x7F]+$/.test(token) &&
          !SEARCH_NOISE_TOKENS.has(token),
      )
      .map((token) => token.slice(0, MAX_FUZZY_SEARCH_TOKEN_LENGTH))
      .filter((token) => {
        if (seen.has(token)) return false;
        seen.add(token);
        return true;
      });
  });
  const tokens: string[] = [];
  const seen = new Set<string>();

  for (
    let tokenIndex = 0;
    tokens.length < MAX_FUZZY_SEARCH_TOKENS;
    tokenIndex++
  ) {
    let foundTokenAtIndex = false;
    for (const keyTokens of tokensByKey) {
      const token = keyTokens[tokenIndex];
      if (!token) continue;
      foundTokenAtIndex = true;
      if (seen.has(token)) continue;
      seen.add(token);
      tokens.push(token);
      if (tokens.length === MAX_FUZZY_SEARCH_TOKENS) break;
    }
    if (!foundTokenAtIndex) break;
  }

  return tokens;
}

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
    const exactRows: Array<{
      id: string;
      name: string;
      normalizedName: string;
      userId: string | null;
    }> = [];
    for (const normalizedNames of chunkInValues(
      Array.from(allNormalizedKeys),
      1,
    )) {
      const rows = await db
        .select({
          id: ingredient.id,
          name: ingredient.name,
          normalizedName: ingredient.normalizedName,
          userId: ingredient.userId,
        })
        .from(ingredient)
        .where(
          and(
            inArray(ingredient.normalizedName, normalizedNames),
            userScope(userId),
          ),
        );
      exactRows.push(...rows);
    }
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
    const aliasRows: Array<{
      aliasNormalized: string;
      ingredientId: string;
      ingredientName: string;
      ingredientNormalizedName: string;
      ingredientUserId: string | null;
    }> = [];
    for (const aliasNames of chunkInValues(Array.from(keysForAlias), 1)) {
      const rows = await db
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
            inArray(ingredientAlias.aliasNormalized, aliasNames),
            userScope(userId),
          ),
        );
      aliasRows.push(...rows);
    }
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
    }
  }

  const unresolved = suggestions.filter(
    (item) => !item.suggestedIngredient && item.normalizedKey.trim() !== "",
  );
  const fuzzyCatalogById = new Map<string, FuzzyCatalogEntry>();
  const fuzzySearchTokens = collectFuzzySearchTokens(
    unresolved.map((item) => item.normalizedKey),
  );
  for (const searchTokens of chunkInValues(fuzzySearchTokens, 1)) {
    const rows = await db
      .select({
        id: ingredient.id,
        name: ingredient.name,
        normalizedName: ingredient.normalizedName,
        userId: ingredient.userId,
      })
      .from(ingredient)
      .where(
        and(
          userScope(userId),
          or(
            ...searchTokens.map((token) =>
              like(ingredient.normalizedName, `%${token}%`),
            ),
          ),
        ),
      )
      .limit(FUZZY_QUERY_RESULT_TAKE);
    for (const row of rows) {
      if (!fuzzyCatalogById.has(row.id)) fuzzyCatalogById.set(row.id, row);
    }
  }
  const fuzzyCatalog = [...fuzzyCatalogById.values()];

  for (const item of unresolved) {
    const withScores = rankIngredientCatalogCandidates(
      item.normalizedKey,
      fuzzyCatalog,
      userId,
    );

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
      .slice(0, MAX_SUGGESTION_CANDIDATES)
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
