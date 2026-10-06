/**
 * Search a user's saved recipes. Uses AI Search (hybrid semantic + keyword)
 * when enabled, and always merges in D1 title matches so exact names still
 * win and the feature degrades to title search if AI Search is off or down.
 *
 * AI Search is only a candidate generator: every id it returns is checked
 * against the user's current D1 recipes, because deleted items keep showing
 * in results for a few minutes and the index is shared across users.
 */
import { and, desc, eq } from "drizzle-orm";
import { recipe, recipeTag, type Db } from "@/db";
import { fuzzyFilterRecipes } from "./fuzzy-recipe";
import {
  syncPendingForUser,
  type RecipeSearchInstance,
  type WaitUntil,
} from "./recipe-index";

/** AI Search returns chunks, not recipes; over-fetch so dedupe leaves enough. */
export const SEMANTIC_CHUNK_LIMIT = 50;

/**
 * - `semantic`: AI Search results merged with title matches.
 * - `title`: AI Search disabled; title matches only.
 * - `degraded`: AI Search failed; title matches only.
 */
export type RecipeSearchMode = "semantic" | "title" | "degraded";

export type SearchUserRecipesDeps = {
  db: Db;
  /** Null when AI Search is not configured. */
  instance: RecipeSearchInstance | null;
  /** Feature flag: query AI Search. Indexing runs regardless. */
  semanticEnabled: boolean;
  waitUntil?: WaitUntil;
};

export type SearchUserRecipesOptions = {
  query: string;
  tagId?: string | null;
  limit: number;
};

export type SearchUserRecipesResult = {
  ids: string[];
  mode: RecipeSearchMode;
};

async function loadCandidateTitles(
  db: Db,
  userId: string,
  tagId: string | null | undefined,
): Promise<{ id: string; title: string }[]> {
  const columns = { id: recipe.id, title: recipe.title };
  if (!tagId) {
    return db
      .select(columns)
      .from(recipe)
      .where(eq(recipe.userId, userId))
      .orderBy(desc(recipe.updatedAt));
  }
  return db
    .select(columns)
    .from(recipe)
    .innerJoin(recipeTag, eq(recipeTag.recipeId, recipe.id))
    .where(and(eq(recipe.userId, userId), eq(recipeTag.tagId, tagId)))
    .orderBy(desc(recipe.updatedAt));
}

function recipeIdFromChunk(
  chunk: AiSearchSearchResponse["chunks"][number],
  userId: string,
): string | null {
  const metadata = chunk.item.metadata ?? {};
  // Defense in depth: the query filters on user_id, but never trust it alone.
  if (metadata.user_id !== undefined && metadata.user_id !== userId) return null;
  if (typeof metadata.recipe_id === "string" && metadata.recipe_id) {
    return metadata.recipe_id;
  }
  const prefix = `users/${userId}/recipes/`;
  const { key } = chunk.item;
  if (!key.startsWith(prefix) || !key.endsWith(".md")) return null;
  return key.slice(prefix.length, -".md".length) || null;
}

/** Recipe ids from AI Search, best first, deduped. Throws on service failure. */
export async function semanticRecipeIds(
  instance: RecipeSearchInstance,
  userId: string,
  query: string,
): Promise<string[]> {
  const response = await instance.search({
    query,
    ai_search_options: {
      retrieval: {
        filters: { user_id: userId },
        max_num_results: SEMANTIC_CHUNK_LIMIT,
        keyword_match_mode: "or",
        return_on_failure: false,
      },
      // The semantic cache is instance-wide, so a cached answer could carry
      // another user's results. Results are re-checked in D1 regardless.
      cache: { enabled: false },
    },
  });
  const ids: string[] = [];
  const seen = new Set<string>();
  const chunks = [...response.chunks].sort((a, b) => b.score - a.score);
  for (const chunk of chunks) {
    const id = recipeIdFromChunk(chunk, userId);
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

function uniqueLimited(ids: string[], limit: number): string[] {
  return [...new Set(ids)].slice(0, limit);
}

export async function searchUserRecipes(
  deps: SearchUserRecipesDeps,
  userId: string,
  { query, tagId, limit }: SearchUserRecipesOptions,
): Promise<SearchUserRecipesResult> {
  const { db, instance, semanticEnabled, waitUntil } = deps;

  // Lazy backfill: recipes saved before indexing existed, or whose
  // background upload died, get picked up a batch at a time.
  if (instance && waitUntil) {
    waitUntil(
      syncPendingForUser({ db, instance }, userId).catch((error) => {
        console.error(
          JSON.stringify({
            message: "Search backfill failed",
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }),
    );
  }

  const candidates = await loadCandidateTitles(db, userId, tagId);
  const normalizedQuery = query.trim().toLowerCase();
  const titleMatches = fuzzyFilterRecipes(candidates, query);
  const exactTitleIds: string[] = [];
  const looseTitleIds: string[] = [];
  for (const match of titleMatches) {
    (match.title.toLowerCase().includes(normalizedQuery)
      ? exactTitleIds
      : looseTitleIds
    ).push(match.id);
  }
  const titleOnly = uniqueLimited([...exactTitleIds, ...looseTitleIds], limit);

  if (!instance || !semanticEnabled) return { ids: titleOnly, mode: "title" };

  let semanticIds: string[];
  try {
    semanticIds = await semanticRecipeIds(instance, userId, query);
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "AI Search query failed; falling back to title search",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return { ids: titleOnly, mode: "degraded" };
  }

  const allowed = new Set(candidates.map((candidate) => candidate.id));
  const verifiedSemanticIds = semanticIds.filter((id) => allowed.has(id));
  return {
    ids: uniqueLimited(
      [...exactTitleIds, ...verifiedSemanticIds, ...looseTitleIds],
      limit,
    ),
    mode: "semantic",
  };
}
