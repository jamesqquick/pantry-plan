"use server";

import { getDb } from "@/lib/db";
import { getAuthenticatedUser } from "@/app/actions/_shared";
import { zodToFieldErrors } from "@/lib/action-helpers";
import type { ActionResult } from "@/lib/action-helpers";
import { suggestMappingsSchema } from "@/features/import/import.schemas";
import {
  computeIngredientSuggestions,
  type SuggestionItem,
} from "@/lib/ingredients/compute-suggestions";
import { suggestMappingsWithLLM } from "@/lib/ingredients/llm-ingredient-mapping";

const FUZZY_THRESHOLD_LLM_CANDIDATES = 0.1;
const MAX_LLM_CANDIDATES_PER_LINE = 20;
const LLM_CATALOG_FALLBACK_SIZE = 100;

export async function suggestIngredientMappingsAction(
  raw: unknown,
): Promise<ActionResult<{ suggestions: SuggestionItem[] }>> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;
  const user = userResult.data;

  const parsed = suggestMappingsSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        fieldErrors: zodToFieldErrors(parsed.error.issues),
      },
    };
  }

  const suggestions = await computeIngredientSuggestions(
    parsed.data.lines,
    user.id,
  );

  const userScope = { OR: [{ userId: null }, { userId: user.id }] };
  const candidateIds = new Set<string>();
  for (let i = 0; i < suggestions.length; i++) {
    const item = suggestions[i]!;
    if (item.suggestedIngredient || !item.normalizedKey.trim()) continue;
    const topForLlm = (item.candidates ?? [])
      .filter((c) => (c.score ?? 0) >= FUZZY_THRESHOLD_LLM_CANDIDATES)
      .slice(0, MAX_LLM_CANDIDATES_PER_LINE);
    for (const c of topForLlm) candidateIds.add(c.id);
  }

  const unmapped = suggestions
    .map((s, i) => ({ originalIndex: i, text: s.originalLine }))
    .filter(
      (_, i) =>
        !suggestions[i]!.suggestedIngredient &&
        suggestions[i]!.normalizedKey.trim() !== "",
    );

  if (unmapped.length > 0 && process.env.OPENAI_API_KEY?.trim()) {
    const db = getDb();
    let catalogForLlm: { id: string; normalizedName: string; name: string }[];
    if (candidateIds.size > 0) {
      catalogForLlm = await db.ingredient.findMany({
        where: { id: { in: Array.from(candidateIds) } },
        select: { id: true, normalizedName: true, name: true },
      });
    } else {
      catalogForLlm = await db.ingredient.findMany({
        where: userScope,
        select: { id: true, normalizedName: true, name: true },
        take: LLM_CATALOG_FALLBACK_SIZE,
        orderBy: { name: "asc" },
      });
    }
    if (catalogForLlm.length === 0) {
      catalogForLlm = await db.ingredient.findMany({
        where: userScope,
        select: { id: true, normalizedName: true, name: true },
        take: LLM_CATALOG_FALLBACK_SIZE,
        orderBy: { name: "asc" },
      });
    }
    const llmSuggestions = await suggestMappingsWithLLM(
      unmapped,
      catalogForLlm,
    );
    const llmIngredientIds = new Set<string>();
    for (const [, suggestion] of llmSuggestions) {
      if ("ingredientId" in suggestion) llmIngredientIds.add(suggestion.ingredientId);
    }
    const idToIngredient = new Map<string, { id: string; name: string; normalizedName: string }>();
    if (llmIngredientIds.size > 0) {
      const llmIngredients = await db.ingredient.findMany({
        where: { id: { in: Array.from(llmIngredientIds) } },
        select: { id: true, name: true, normalizedName: true },
      });
      for (const ing of llmIngredients) idToIngredient.set(ing.id, ing);
    }
    for (const [originalIndex, suggestion] of llmSuggestions) {
      const item = suggestions[originalIndex];
      if (!item) continue;
      if ("ingredientId" in suggestion) {
        const ing = idToIngredient.get(suggestion.ingredientId);
        if (ing) {
          item.suggestedIngredient = {
            id: ing.id,
            name: ing.name,
            normalizedName: ing.normalizedName,
            matchType: "llm",
          };
        }
      } else {
        item.suggestedCreateName = suggestion.createName;
      }
    }
  }

  return { ok: true, data: { suggestions } };
}
