/**
 * Enhance actions: re-map ingredient lines for an existing recipe.
 *
 * LLM pass uses Workers AI.
 */

import { ActionError, defineAction } from "astro:actions";
import { and, eq, isNull, or } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { recipeIdOnlySchema } from "@/features/recipes/recipe-ingredients.schemas";
import { validateIngredientMeasurements } from "@/features/recipes/ingredient-measurements";
import {
  recipe,
  recipeIngredient,
  ingredient,
  ingredientAlias,
} from "@/db";
import { normalizeIngredientName } from "@/lib/ingredients/normalize";
import { formatIngredientLine } from "@/lib/ingredients/format-ingredient-line";
import { parseScalableIngredientLine } from "@/lib/ingredients/parse-ingredient-line-structured";
import type { SuggestionItem } from "@/lib/ingredients/compute-suggestions";
import { suggestIngredientMappings } from "@/lib/ingredients/suggest-ingredient-mappings";
import { autoConvert } from "@/lib/measurements/auto-convert";
import { getDb, queueSearchSync, requireUser } from "./_shared";

export type EnhancedRecipeIngredientResult = {
  ingredientId: string | null;
  ingredientName: string;
  quantity: number;
  unit: string;
  displayText: string;
  rawText: string | null;
  sortOrder: number;
};

/** Drizzle WHERE: global OR user-owned ingredients. */
function userScope(userId: string) {
  return or(isNull(ingredient.userId), eq(ingredient.userId, userId));
}

/**
 * Run deterministic + optional LLM suggestion pass and merge results.
 */
async function runSuggestionPasses(
  db: ReturnType<typeof getDb>,
  lines: string[],
  userId: string,
): Promise<SuggestionItem[]> {
  const result = await suggestIngredientMappings(db, lines, userId, env.AI);
  return result.suggestions;
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
          quantity: recipeIngredient.quantity,
          unit: recipeIngredient.unit,
          parseConfidence: recipeIngredient.parseConfidence,
        })
        .from(recipeIngredient)
        .where(eq(recipeIngredient.recipeId, recipeRow.id))
        .orderBy(recipeIngredient.sortOrder);

      const lines = existingIngredients.map(
        (ri) => ri.rawText?.trim() || formatIngredientLine(ri),
      );
      if (lines.length === 0) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: "Recipe has no ingredient lines.",
        });
      }

      const structuredLines = existingIngredients.map((ingredient, index) => {
        const parsed = parseScalableIngredientLine(lines[index]!);
        return parsed.kind === "scalable"
          ? {
              quantity: parsed.quantity,
              unit: parsed.unit,
              displayText: parsed.displayText,
              parseConfidence: ingredient.parseConfidence,
            }
          : {
              quantity: ingredient.quantity,
              unit: ingredient.unit,
              displayText: ingredient.displayText,
              parseConfidence: ingredient.parseConfidence,
            };
      });
      try {
        validateIngredientMeasurements(structuredLines);
      } catch (error) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: error instanceof Error
            ? error.message
            : "Every ingredient needs a quantity and unit.",
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
        const structured = structuredLines[i]!;
        const { quantity, unit, displayText } = structured;

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
                costBasisUnit: unit === "COUNT"
                  ? "COUNT"
                  : ["TSP", "TBSP", "CUP", "PINCH"].includes(unit)
                    ? "CUP"
                    : "G",
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
              gramsPerEach: ingredient.gramsPerEach,
              cupsPerEach: ingredient.cupsPerEach,
            })
            .from(ingredient)
            .where(eq(ingredient.id, ingredientId))
            .limit(1);
          const converted = autoConvert({
            quantity,
            unit,
            ingredient: ingForConvert ?? {
              normalizedName: null,
              gramsPerCup: null,
              gramsPerEach: null,
              cupsPerEach: null,
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
          unit,
          displayText,
          rawText: rawLine.trim() || null,
          parseConfidence: structured.parseConfidence,
          sortOrder: i,
          originalQuantity: quantity,
          originalUnit: unit,
          weightGrams,
          conversionSource,
          conversionConfidence,
          conversionNotes,
        });

        returnItems.push({
          ingredientId,
          ingredientName,
          quantity,
          unit,
          displayText,
          rawText: rawLine.trim() || null,
          sortOrder: i,
        });
      }

      await queueSearchSync(ctx, db, [recipeRow.id]);
      return { items: returnItems };
    },
  }),
};
