import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { ingredient, type Db } from "@/db";
import { chunkInValues } from "@/db/chunked-read";
import type { IngredientMappingRequest } from "@/lib/ingredients/mapping-request";
import { ingredientDocumentKey, ingredientScopeKey, MAX_INGREDIENT_DOCUMENT_NAME_LENGTH } from "./ingredient-document";
import { loadIngredientDocumentInputs, type IngredientSearchInstance } from "./ingredient-index";

export const MAX_INGREDIENT_CANDIDATES = 12;
const INITIAL_INGREDIENT_CANDIDATES = 6;
export const INGREDIENT_SEARCH_CONCURRENCY = 4;

export type IngredientCandidate = {
  id: string;
  name: string;
  normalizedName: string;
  aliases: readonly string[];
};

export type IngredientRetrievalLine = {
  originalIndex: number;
  text: string;
  normalizedKey: string;
  fuzzyCandidateIds: readonly string[];
};

export type IngredientRetrievalResult = {
  candidates: IngredientCandidate[];
  failed: boolean;
};

/** Always load names/aliases from D1, never from remote chunk text or metadata. */
export async function loadVerifiedIngredientCandidates(
  db: Db,
  userId: string,
  candidateIds: readonly string[],
  ownershipPreference: "prefer-owned" | "preserve-id" = "prefer-owned",
): Promise<Map<string, IngredientCandidate>> {
  const rows: { id: string; normalizedName: string; userId: string | null }[] = [];
  for (const ids of chunkInValues([...new Set(candidateIds)], 2)) {
    rows.push(...await db.select({
      id: ingredient.id,
      normalizedName: sql<string>`substr(${ingredient.normalizedName}, 1, ${MAX_INGREDIENT_DOCUMENT_NAME_LENGTH + 1})`,
      userId: ingredient.userId,
    }).from(ingredient).where(and(inArray(ingredient.id, ids), or(isNull(ingredient.userId), eq(ingredient.userId, userId)))));
  }
  const ownedByName = new Map<string, string>();
  const globalNames = ownershipPreference === "prefer-owned"
    ? [...new Set(rows.filter((row) => row.userId === null).map((row) => row.normalizedName))] : [];
  for (const names of chunkInValues(globalNames, 1)) {
    const owned = await db.select({ id: ingredient.id, normalizedName: ingredient.normalizedName }).from(ingredient)
      .where(and(eq(ingredient.userId, userId), inArray(ingredient.normalizedName, names)));
    for (const row of owned) ownedByName.set(row.normalizedName, row.id);
  }
  const preferredIds = new Map(rows.map((row) => [row.id, ownedByName.get(row.normalizedName) ?? row.id]));
  const inputs = await loadIngredientDocumentInputs(db, [...preferredIds.values()]);
  const expectedNames = new Map(rows.map((row) => [row.id, row.normalizedName]));
  const result = new Map<string, IngredientCandidate>();
  for (const [originalId, preferredId] of preferredIds) {
    const input = inputs.get(preferredId);
    if (!input || input.normalizedName !== expectedNames.get(originalId) || (input.userId !== null && input.userId !== userId)) continue;
    if (!input.name.trim() || !input.normalizedName.trim() || input.name.length > MAX_INGREDIENT_DOCUMENT_NAME_LENGTH || input.normalizedName.length > MAX_INGREDIENT_DOCUMENT_NAME_LENGTH) continue;
    result.set(originalId, { id: input.id, name: input.name, normalizedName: input.normalizedName, aliases: input.aliases });
  }
  return result;
}

function semanticIds(response: AiSearchSearchResponse, userId: string): string[] {
  const ids: string[] = [];
  for (const chunk of [...response.chunks].sort((a, b) => b.score - a.score)) {
    const metadata = chunk.item.metadata ?? {};
    const id = metadata.ingredient_id;
    if (!Number.isFinite(chunk.score) || typeof id !== "string" || !id || id.length > 100) continue;
    if (metadata.scope_key !== "global" && metadata.scope_key !== ingredientScopeKey(userId)) continue;
    if (chunk.item.key !== ingredientDocumentKey(id)) continue;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

function mergeRankedIds(semantic: readonly string[], fuzzy: readonly string[]): string[] {
  const ids = new Set<string>();
  for (let rank = 0; rank < Math.max(semantic.length, fuzzy.length); rank++) {
    for (const id of [semantic[rank], fuzzy[rank]]) if (id) ids.add(id);
  }
  return [...ids];
}

export async function retrieveIngredientCandidates(
  deps: { db: Db; instance: Pick<IngredientSearchInstance, "search">; request: IngredientMappingRequest },
  userId: string,
  lines: readonly IngredientRetrievalLine[],
  retry = false,
): Promise<Map<number, IngredientRetrievalResult>> {
  const retrieved = new Map<number, { ids: string[]; failed: boolean }>();
  const queries = new Map<string, Promise<AiSearchSearchResponse>>();
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(INGREDIENT_SEARCH_CONCURRENCY, lines.length) }, async () => {
    while (next < lines.length) {
      const line = lines[next++]!;
      try {
        const query = retry ? line.normalizedKey.slice(0, 500) : `${line.normalizedKey.slice(0, 500)}\n${line.text.slice(0, 1_000)}`;
        let pending = queries.get(query);
        if (!pending) {
          pending = deps.request("search", () => deps.instance.search({
          query,
          ai_search_options: {
            retrieval: {
              retrieval_type: "hybrid", filters: { scope_key: { $in: ["global", ingredientScopeKey(userId)] } },
              max_num_results: retry ? 30 : 20, match_threshold: retry ? 0.05 : 0.1,
              keyword_match_mode: "or", metadata_only: true, return_on_failure: false,
            },
            cache: { enabled: false }, query_rewrite: { enabled: false }, reranking: { enabled: false },
          },
          }));
          queries.set(query, pending);
        }
        const response = await pending;
        retrieved.set(line.originalIndex, { ids: mergeRankedIds(semanticIds(response, userId), line.fuzzyCandidateIds), failed: false });
      } catch {
        retrieved.set(line.originalIndex, { ids: [...line.fuzzyCandidateIds], failed: true });
      }
    }
  }));
  const verified = await loadVerifiedIngredientCandidates(deps.db, userId, [...retrieved.values()].flatMap((row) => row.ids));
  const results = new Map<number, IngredientRetrievalResult>();
  const candidateLimit = retry ? MAX_INGREDIENT_CANDIDATES : INITIAL_INGREDIENT_CANDIDATES;
  for (const line of lines) {
    const row = retrieved.get(line.originalIndex)!;
    const candidates = new Map<string, IngredientCandidate>();
    for (const id of row.ids) {
      const candidate = verified.get(id);
      if (candidate) candidates.set(candidate.id, candidate);
      if (candidates.size === candidateLimit) break;
    }
    results.set(line.originalIndex, { candidates: [...candidates.values()], failed: row.failed });
  }
  return results;
}
