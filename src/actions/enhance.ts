/**
 * Enhance actions: re-map ingredient lines for an existing recipe, or enrich
 * raw ingredient lines with structured suggestions (no DB mutation).
 *
 * LLM pass uses Workers AI (Gemma 4 26B).
 */

import { ActionError, defineAction } from "astro:actions";
import { and, eq, isNull, or } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { recipeIdOnlySchema } from "@/features/recipes/recipe-ingredients.schemas";
import { suggestMappingsSchema } from "@/features/import/import.schemas";
import {
  recipe,
  recipeIngredient,
  ingredient,
  ingredientAlias,
} from "@/db";
import { normalizeIngredientName } from "@/lib/ingredients/normalize";
import { UNIT_FROM_LABEL } from "@/lib/ingredients/units";
import {
  parseIngredientLineStructured,
  getDisplayTextFromIngredientLine,
} from "@/lib/ingredients/parse-ingredient-line-structured";
import {
  computeIngredientSuggestions,
  type SuggestionItem,
} from "@/lib/ingredients/compute-suggestions";
import {
  suggestMappingsWithLLM,
  type UnmappedLine,
  type CatalogEntry,
} from "@/lib/ai/llm-ingredient-mapping";
import { autoConvert } from "@/lib/measurements/auto-convert";
import { canUseWorkersAi } from "@/lib/entitlements";
import { getDb, requireUser } from "./_shared";

const FUZZY_THRESHOLD_LLM_CANDIDATES = 0.1;
const MAX_LLM_CANDIDATES_PER_LINE = 20;
const LLM_CATALOG_FALLBACK_SIZE = 500;

export type EnhancedRecipeIngredientResult = {
  ingredientId: string | null;
  ingredientName: string;
  quantity: number | null;
  unit: string | null;
  displayText: string;
  rawText: string | null;
  sortOrder: number;
};

export type EnhancedIngredientLineItem = {
  rawText: string;
  displayText: string;
  quantity: number | null;
  unit: string | null;
  ingredientId: string;
  ingredientName: string;
  createName: string;
  sortOrder: number;
  matchType?: "exact" | "alias" | "fuzzy" | "llm";
};

/** Drizzle WHERE: global OR user-owned ingredients. */
function userScope(userId: string) {
  return or(isNull(ingredient.userId), eq(ingredient.userId, userId));
}

/**
 * Run deterministic + optional LLM suggestion pass and merge results.
 * Shared by both enhance actions.
 */
async function runSuggestionPasses(
  db: ReturnType<typeof getDb>,
  lines: string[],
  userId: string,
): Promise<SuggestionItem[]> {
  const suggestions = await computeIngredientSuggestions(db, lines, userId);

  const ai = env.AI;
  if (!canUseWorkersAi(ai)) return suggestions;

  // Collect candidate IDs for LLM context
  const candidateIds = new Set<string>();
  for (const item of suggestions) {
    if (item.suggestedIngredient || !item.normalizedKey.trim()) continue;
    const topForLlm = (item.candidates ?? [])
      .filter((c) => (c.score ?? 0) >= FUZZY_THRESHOLD_LLM_CANDIDATES)
      .slice(0, MAX_LLM_CANDIDATES_PER_LINE);
    for (const c of topForLlm) candidateIds.add(c.id);
  }

  const unmapped: UnmappedLine[] = suggestions
    .map((s, i) => ({ originalIndex: i, text: s.originalLine }))
    .filter(
      (_, i) =>
        !suggestions[i]!.suggestedIngredient &&
        suggestions[i]!.normalizedKey.trim() !== "",
    );
  if (unmapped.length === 0) return suggestions;

  // Build catalog for LLM
  const catalog: CatalogEntry[] = await db
    .select({
      id: ingredient.id,
      name: ingredient.name,
      normalizedName: ingredient.normalizedName,
    })
    .from(ingredient)
    .where(userScope(userId))
    .limit(LLM_CATALOG_FALLBACK_SIZE);

  const llmMap = await suggestMappingsWithLLM(ai, unmapped, catalog);

  // Merge LLM suggestions
  for (const [idx, suggestion] of llmMap) {
    const item = suggestions[idx];
    if (!item || item.suggestedIngredient) continue;
    if ("ingredientId" in suggestion) {
      const match = catalog.find((c) => c.id === suggestion.ingredientId);
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
}

export const enhance = {
  /**
   * Re-map an existing recipe's ingredients. Reads rawText from the recipe's
   * ingredient rows, runs suggestion engine, deletes old rows and inserts
   * enhanced ones with ingredient IDs, conversion data, and aliases.
   */
  recipeIngredients: defineAction({
    input: recipeIdOnlySchema,
    handler: async (
      input,
      ctx,
    ): Promise<{ items: EnhancedRecipeIngredientResult[] }> => {
      const user = requireUser(ctx);
      const db = getDb();

      // Fetch the recipe + its ingredient rows
      const [recipeRow] = await db
        .select({ id: recipe.id })
        .from(recipe)
        .where(and(eq(recipe.id, input.recipeId), eq(recipe.userId, user.id)))
        .limit(1);
      if (!recipeRow) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Recipe not found.",
        });
      }

      const existingIngredients = await db
        .select({
          rawText: recipeIngredient.rawText,
          displayText: recipeIngredient.displayText,
        })
        .from(recipeIngredient)
        .where(eq(recipeIngredient.recipeId, recipeRow.id))
        .orderBy(recipeIngredient.sortOrder);

      const lines = existingIngredients.map(
        (ri) => (ri.rawText ?? ri.displayText ?? "").trim() || ri.displayText,
      );
      if (lines.length === 0) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Recipe has no ingredient lines.",
        });
      }

      const suggestions = await runSuggestionPasses(db, lines, user.id);

      // Delete old ingredient rows
      await db
        .delete(recipeIngredient)
        .where(eq(recipeIngredient.recipeId, recipeRow.id));

      // Insert enhanced rows
      const returnItems: EnhancedRecipeIngredientResult[] = [];

      for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i]!;
        const suggestion = suggestions[i]!;
        const structured = parseIngredientLineStructured(rawLine);
        const quantity =
          structured.quantityDecimal != null &&
          Number.isFinite(structured.quantityDecimal)
            ? structured.quantityDecimal
            : null;
        const unitEnum = structured.unit
          ? (UNIT_FROM_LABEL[structured.unit] ?? null)
          : null;
        const displayText =
          getDisplayTextFromIngredientLine(rawLine).trim() ||
          rawLine.trim() ||
          "\u2014";

        let ingredientId: string | null = null;
        let ingredientName = "";

        if (suggestion.suggestedIngredient) {
          ingredientId = suggestion.suggestedIngredient.id;
          ingredientName = suggestion.suggestedIngredient.name;
        } else if (suggestion.suggestedCreateName?.trim()) {
          const createName = suggestion.suggestedCreateName.trim();
          ingredientName = createName;
          const normalizedName = normalizeIngredientName(createName);

          // Find or create
          const [existing] = await db
            .select({ id: ingredient.id, name: ingredient.name })
            .from(ingredient)
            .where(
              and(userScope(user.id), eq(ingredient.normalizedName, normalizedName)),
            )
            .limit(1);
          if (existing) {
            ingredientId = existing.id;
            ingredientName = existing.name;
          } else {
            const [created] = await db
              .insert(ingredient)
              .values({
                userId: user.id,
                name: createName,
                normalizedName,
                costBasisUnit: "G",
              })
              .returning({ id: ingredient.id });
            ingredientId = created!.id;
          }

          // Upsert alias
          const aliasNorm = (
            normalizeIngredientName(rawLine.trim()) ||
            normalizeIngredientName(createName)
          ).trim();
          if (aliasNorm) {
            const [existingAlias] = await db
              .select({ id: ingredientAlias.id })
              .from(ingredientAlias)
              .where(eq(ingredientAlias.aliasNormalized, aliasNorm))
              .limit(1);
            if (existingAlias) {
              await db
                .update(ingredientAlias)
                .set({ ingredientId })
                .where(eq(ingredientAlias.id, existingAlias.id));
            } else {
              await db.insert(ingredientAlias).values({
                ingredientId,
                aliasNormalized: aliasNorm,
              });
            }
          }
        }

        // Auto-convert to weight when we have a mapping
        let weightGrams: number | null = null;
        let conversionSource: string | null = null;
        let conversionConfidence: string | null = null;
        let conversionNotes: string | null = null;

        if (ingredientId) {
          const [ingForConvert] = await db
            .select({
              normalizedName: ingredient.normalizedName,
              gramsPerCup: ingredient.gramsPerCup,
            })
            .from(ingredient)
            .where(eq(ingredient.id, ingredientId))
            .limit(1);
          const converted = autoConvert({
            quantity: quantity ?? 1,
            unit: unitEnum ?? null,
            ingredient: ingForConvert ?? {
              normalizedName: null,
              gramsPerCup: null,
            },
            originalLine: rawLine,
          });
          weightGrams = converted.weightGrams ?? null;
          conversionSource = converted.conversionSource ?? null;
          conversionConfidence = converted.conversionConfidence ?? null;
          conversionNotes = converted.conversionNotes ?? null;
        }

        await db.insert(recipeIngredient).values({
          recipeId: recipeRow.id,
          ingredientId,
          quantity,
          unit: unitEnum,
          displayText,
          rawText: rawLine.trim() || null,
          parseConfidence: structured.parseConfidence,
          sortOrder: i,
          originalQuantity: quantity,
          originalUnit: unitEnum,
          weightGrams,
          conversionSource,
          conversionConfidence,
          conversionNotes,
        });

        returnItems.push({
          ingredientId,
          ingredientName,
          quantity,
          unit: unitEnum,
          displayText,
          rawText: rawLine.trim() || null,
          sortOrder: i,
        });
      }

      return { items: returnItems };
    },
  }),

  /**
   * Enrich raw ingredient lines with suggestions. Does NOT mutate the DB
   * (no recipe involved). Used by the import draft editor to show mapping
   * previews before saving.
   */
  ingredientLines: defineAction({
    input: suggestMappingsSchema,
    handler: async (
      input,
      ctx,
    ): Promise<{ items: EnhancedIngredientLineItem[] }> => {
      const user = requireUser(ctx);
      const db = getDb();
      const { lines } = input;

      if (lines.length === 0) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "At least one ingredient line is required.",
        });
      }

      const suggestions = await runSuggestionPasses(db, lines, user.id);

      const items: EnhancedIngredientLineItem[] = [];
      for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i]!;
        const suggestion = suggestions[i]!;
        const structured = parseIngredientLineStructured(rawLine);
        const quantity =
          structured.quantityDecimal != null &&
          Number.isFinite(structured.quantityDecimal)
            ? structured.quantityDecimal
            : null;
        const unitEnum = structured.unit
          ? (UNIT_FROM_LABEL[structured.unit] ?? null)
          : null;
        const displayText =
          getDisplayTextFromIngredientLine(rawLine).trim() ||
          rawLine.trim() ||
          "\u2014";

        let ingredientId = "";
        let ingredientName = "";
        let createName = "";
        let matchType: "exact" | "alias" | "fuzzy" | "llm" | undefined;

        if (suggestion.suggestedIngredient) {
          ingredientId = suggestion.suggestedIngredient.id;
          ingredientName = suggestion.suggestedIngredient.name;
          matchType = suggestion.suggestedIngredient.matchType;
        } else if (suggestion.suggestedCreateName?.trim()) {
          createName = suggestion.suggestedCreateName.trim();
        }

        items.push({
          rawText: rawLine.trim() || rawLine,
          displayText,
          quantity,
          unit: unitEnum,
          ingredientId,
          ingredientName,
          createName,
          sortOrder: i,
          matchType,
        });
      }

      return { items };
    },
  }),
};
