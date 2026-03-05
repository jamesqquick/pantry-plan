import type { IngredientUnit } from "@prisma/client";
import { getDb } from "@/lib/db";
import { normalizeIngredientName } from "@/lib/ingredients/normalize";
import { parseIngredientLineForImport } from "@/lib/ingredients/parse-line";
import { stringSimilarity, tokenize } from "@/lib/ingredients/similarity";

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

/**
 * Compute ingredient suggestions for raw lines using exact match, alias, and fuzzy
 * (LIKE + Jaccard) only. No LLM. Candidates have score >= 0.10.
 * Used by URL parse (non-LLM path and as input to mapUrlDraftToStructured).
 */
export async function computeIngredientSuggestions(
  lines: string[],
  userId: string
): Promise<SuggestionItem[]> {
  const db = getDb();
  const suggestions: SuggestionItem[] = [];
  const keysForAlias = new Set<string>();
  const allNormalizedKeys = new Set<string>();

  const userScope = { OR: [{ userId: null }, { userId }] };

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

  const ingredientByNorm: Record<
    string,
    { id: string; name: string; normalizedName: string }
  > = {};
  if (allNormalizedKeys.size > 0) {
    const exactMatchIngredients = await db.ingredient.findMany({
      where: {
        ...userScope,
        normalizedName: { in: Array.from(allNormalizedKeys) },
      },
      select: { id: true, name: true, normalizedName: true },
    });
    for (const i of exactMatchIngredients) {
      ingredientByNorm[i.normalizedName] = i;
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

  const aliasByNorm: Record<
    string,
    { id: string; name: string; normalizedName: string }
  > = {};
  if (keysForAlias.size > 0) {
    const aliases = await db.ingredientAlias.findMany({
      where: { aliasNormalized: { in: Array.from(keysForAlias) } },
      include: {
        ingredient: { select: { id: true, name: true, normalizedName: true } },
      },
    });
    for (const a of aliases) {
      aliasByNorm[a.aliasNormalized] = a.ingredient;
    }
  }

  for (let i = 0; i < suggestions.length; i++) {
    const item = suggestions[i]!;
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

    const normalizedNamePart = item.normalizedKey;
    const rawTokens = tokenize(normalizedNamePart);
    const tokens = rawTokens.filter(
      (t) =>
        t.length >= 2 &&
        !/^\d+$/.test(t) &&
        !SEARCH_NOISE_TOKENS.has(t)
    );
    let fuzzyCandidates: {
      id: string;
      name: string;
      normalizedName: string;
    }[] = [];
    if (tokens.length > 0) {
      fuzzyCandidates = await db.ingredient.findMany({
        where: {
          AND: [
            userScope,
            { OR: tokens.map((t) => ({ normalizedName: { contains: t } })) },
          ],
        },
        select: { id: true, name: true, normalizedName: true },
        take: FUZZY_CANDIDATE_TAKE,
      });
    }
    const withScores = fuzzyCandidates.map((ing) => ({
      ...ing,
      score: stringSimilarity(normalizedNamePart, ing.normalizedName),
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
