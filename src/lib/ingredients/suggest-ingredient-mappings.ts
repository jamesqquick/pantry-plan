import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { Db } from "@/db";
import { ingredient } from "@/db";
import { chunkInValues } from "@/db/chunked-read";
import {
  suggestMappingsWithLLM,
  type CatalogEntry,
  type LlmSuggestion,
  type UnmappedLine,
} from "@/lib/ai/llm-ingredient-mapping";
import { canUseWorkersAi } from "@/lib/entitlements";
import {
  computeIngredientSuggestions,
  type SuggestionItem,
} from "./compute-suggestions";

const MAX_LLM_CATALOG_SIZE = 500;

export type IngredientMappingAiStatus =
  | "not-needed"
  | "succeeded"
  | "unavailable"
  | "failed";

export type IngredientMappingSuggestionResult = {
  suggestions: SuggestionItem[];
  aiStatus: IngredientMappingAiStatus;
};

export function collectRoundRobinCandidateIds(
  candidateLists: readonly (readonly { id: string }[])[],
): string[] {
  const candidateIds: string[] = [];
  const seen = new Set<string>();

  for (let rank = 0; candidateIds.length < MAX_LLM_CATALOG_SIZE; rank++) {
    let foundCandidateAtRank = false;
    for (const candidates of candidateLists) {
      const candidate = candidates[rank];
      if (!candidate) continue;
      foundCandidateAtRank = true;
      if (seen.has(candidate.id)) continue;
      seen.add(candidate.id);
      candidateIds.push(candidate.id);
      if (candidateIds.length === MAX_LLM_CATALOG_SIZE) break;
    }
    if (!foundCandidateAtRank) break;
  }

  return candidateIds;
}

export function mergeCandidateFirstCatalog(
  candidateIds: readonly string[],
  candidateEntries: readonly CatalogEntry[],
  fallbackEntries: readonly CatalogEntry[],
): CatalogEntry[] {
  const candidateById = new Map(
    candidateEntries.map((entry) => [entry.id, entry]),
  );
  const catalog: CatalogEntry[] = [];
  const seen = new Set<string>();

  for (const candidateId of candidateIds) {
    const entry = candidateById.get(candidateId);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    catalog.push(entry);
    if (catalog.length === MAX_LLM_CATALOG_SIZE) return catalog;
  }
  for (const entry of fallbackEntries) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    catalog.push(entry);
    if (catalog.length === MAX_LLM_CATALOG_SIZE) break;
  }

  return catalog;
}

export async function suggestIngredientMappings(
  db: Db,
  lines: string[],
  userId: string,
  ai: Ai | undefined,
  beforeLlm?: () => Promise<void>,
): Promise<IngredientMappingSuggestionResult> {
  const suggestions = await computeIngredientSuggestions(db, lines, userId);

  const unmappedLines: UnmappedLine[] = suggestions
    .map((suggestion, originalIndex) => ({
      originalIndex,
      text: suggestion.originalLine,
    }))
    .filter(
      ({ originalIndex }) =>
        !suggestions[originalIndex]!.suggestedIngredient &&
        suggestions[originalIndex]!.normalizedKey.trim() !== "",
    );
  if (unmappedLines.length === 0) {
    return { suggestions, aiStatus: "not-needed" };
  }
  if (!canUseWorkersAi(ai)) {
    return { suggestions, aiStatus: "unavailable" };
  }

  const candidateIds = collectRoundRobinCandidateIds(
    unmappedLines.map(
      ({ originalIndex }) => suggestions[originalIndex]!.candidates ?? [],
    ),
  );
  const candidateEntries: CatalogEntry[] = [];
  for (const ids of chunkInValues(candidateIds, 1)) {
    const rows = await db
      .select({
        id: ingredient.id,
        name: ingredient.name,
        normalizedName: ingredient.normalizedName,
      })
      .from(ingredient)
      .where(
        and(
          inArray(ingredient.id, ids),
          or(isNull(ingredient.userId), eq(ingredient.userId, userId)),
        ),
      );
    candidateEntries.push(...rows);
  }
  const fallbackEntries: CatalogEntry[] = await db
    .select({
      id: ingredient.id,
      name: ingredient.name,
      normalizedName: ingredient.normalizedName,
    })
    .from(ingredient)
    .where(or(isNull(ingredient.userId), eq(ingredient.userId, userId)))
    .limit(MAX_LLM_CATALOG_SIZE);
  const catalog = mergeCandidateFirstCatalog(
    candidateIds,
    candidateEntries,
    fallbackEntries,
  );

  let llmSuggestions: Map<number, LlmSuggestion>;
  try {
    llmSuggestions = await suggestMappingsWithLLM(
      ai as Ai,
      unmappedLines,
      catalog,
      beforeLlm,
    );
  } catch (err) {
    console.warn(
      `[AI] Workers AI ingredient mapping failed: ${
        err instanceof Error ? err.message : "Unknown error"
      }`,
    );
    return { suggestions, aiStatus: "failed" };
  }
  const catalogById = new Map(catalog.map((entry) => [entry.id, entry]));

  for (const [index, llmSuggestion] of llmSuggestions) {
    const suggestion = suggestions[index];
    if (!suggestion || suggestion.suggestedIngredient) continue;

    if ("ingredientId" in llmSuggestion) {
      const match = catalogById.get(llmSuggestion.ingredientId);
      if (match) {
        suggestion.suggestedIngredient = {
          ...match,
          matchType: "llm",
        };
      }
    } else if ("createName" in llmSuggestion) {
      suggestion.suggestedCreateName = llmSuggestion.createName;
    }
  }

  return { suggestions, aiStatus: "succeeded" };
}
