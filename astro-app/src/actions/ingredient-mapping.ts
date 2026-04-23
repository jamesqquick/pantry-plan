/**
 * Ingredient mapping actions: suggest ingredient mappings for raw lines
 * using deterministic matching + optional LLM fallback.
 *
 * Phase 12: LLM fallback uses Workers AI (Llama 4 Scout) as primary,
 * OpenAI as secondary fallback.
 */

import { defineAction } from "astro:actions";
import { env } from "cloudflare:workers";
import { or, isNull, eq } from "drizzle-orm";
import { suggestMappingsSchema } from "@/features/import/import.schemas";
import { ingredient } from "@/db";
import {
  computeIngredientSuggestions,
  type SuggestionItem,
} from "@/lib/ingredients/compute-suggestions";
import {
  suggestMappingsWithLLM,
  type UnmappedLine,
  type CatalogEntry,
} from "@/lib/ai/llm-ingredient-mapping";
import { canUseWorkersAi, canUseOpenAi } from "@/lib/entitlements";
import { getDb, requireUser } from "./_shared";

export const ingredientMapping = {
  /**
   * Suggest ingredient mappings for a list of raw ingredient lines.
   * First pass: deterministic (exact, alias, fuzzy).
   * Second pass (if AI available): LLM for unmapped lines
   *   — Workers AI primary, OpenAI fallback.
   * Returns SuggestionItem[] with suggestions and candidates.
   */
  suggest: defineAction({
    input: suggestMappingsSchema,
    handler: async (input, ctx): Promise<SuggestionItem[]> => {
      const user = requireUser(ctx);
      const db = getDb();

      // Deterministic pass
      const suggestions = await computeIngredientSuggestions(
        db,
        input.lines,
        user.id,
      );

      // LLM pass for unmapped lines
      const ai = env.AI;
      const openaiKey = env.OPENAI_API_KEY;
      if (!canUseWorkersAi(ai) && !canUseOpenAi(openaiKey)) {
        return suggestions;
      }

      const unmappedLines: UnmappedLine[] = [];
      for (let i = 0; i < suggestions.length; i++) {
        const s = suggestions[i];
        if (!s.suggestedIngredient && s.normalizedKey.trim()) {
          unmappedLines.push({ originalIndex: i, text: s.originalLine });
        }
      }
      if (unmappedLines.length === 0) return suggestions;

      // Build catalog for LLM (global + user ingredients, capped)
      const catalogRows = await db
        .select({
          id: ingredient.id,
          name: ingredient.name,
          normalizedName: ingredient.normalizedName,
        })
        .from(ingredient)
        .where(
          or(isNull(ingredient.userId), eq(ingredient.userId, user.id)),
        )
        .limit(500);
      const catalog: CatalogEntry[] = catalogRows;

      const llmMap = await suggestMappingsWithLLM(
        ai,
        unmappedLines,
        catalog,
        openaiKey,
      );

      // Merge LLM suggestions back
      for (const [idx, suggestion] of llmMap) {
        const item = suggestions[idx];
        if (!item || item.suggestedIngredient) continue;
        if ("ingredientId" in suggestion) {
          const match = catalogRows.find(
            (c) => c.id === suggestion.ingredientId,
          );
          if (match) {
            item.suggestedIngredient = {
              id: match.id,
              name: match.name,
              normalizedName: match.normalizedName,
              matchType: "llm",
            };
          }
        } else if ("createName" in suggestion) {
          item.suggestedCreateName = suggestion.createName;
        }
      }

      return suggestions;
    },
  }),
};
