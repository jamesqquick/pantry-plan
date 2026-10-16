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
import { suggestSemanticIngredientMappings, type SemanticIngredientMappingOptions } from "./semantic-ingredient-mappings";
import { MAX_LINES_PER_RECIPE } from "@/features/import/import.schemas";

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

export class IngredientMappingInputError extends Error {
  constructor(public readonly lineCount: number) {
    super(`Ingredient mapping supports at most ${MAX_LINES_PER_RECIPE} lines.`);
    this.name = "IngredientMappingInputError";
  }
}

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
  ai: Pick<Ai, "run"> | undefined,
  beforeLlm?: () => Promise<void>,
  semantic?: SemanticIngredientMappingOptions,
): Promise<IngredientMappingSuggestionResult> {
  if (lines.length > MAX_LINES_PER_RECIPE) throw new IngredientMappingInputError(lines.length);
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
  if (!ai || !canUseWorkersAi(ai)) {
    return { suggestions, aiStatus: "unavailable" };
  }

  if (semantic?.enabled) {
    return suggestSemanticIngredientMappings(db, suggestions, userId, ai, {
      ...semantic, beforeRequest: semantic.beforeRequest ?? beforeLlm,
    });
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
      ai,
      unmappedLines,
      catalog,
      beforeLlm,
    );
  } catch {
    console.warn("[AI] Workers AI ingredient mapping failed");
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
