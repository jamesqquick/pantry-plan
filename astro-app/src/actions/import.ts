/**
 * Import actions: save a parsed recipe draft to the database.
 * Two paths:
 *   - saveWithMappings: structured ingredient rows with ingredientId or createName
 *   - saveTextOnly: raw text ingredient lines (no mapping, for quick saves)
 */

import { ActionError, defineAction } from "astro:actions";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import {
  saveImportedRecipeSchema,
  saveImportedRecipeTextOnlySchema,
} from "@/features/import/import.schemas";
import {
  recipe,
  recipeIngredient,
  recipeInstruction,
  recipeTag,
  tag,
  ingredient,
  ingredientAlias,
} from "@/db";
import { normalizeIngredientName } from "@/lib/ingredients/normalize";
import { UNIT_FROM_LABEL } from "@/lib/ingredients/units";
import { autoConvert } from "@/lib/measurements/auto-convert";
import {
  parseIngredientLineStructured,
  getDisplayTextFromIngredientLine,
} from "@/lib/ingredients/parse-ingredient-line-structured";
import { getDb, requireUser } from "./_shared";

/** Filter tagIds to ones the user actually owns. */
async function filterOwnedTagIds(
  db: ReturnType<typeof getDb>,
  userId: string,
  tagIds: readonly string[],
): Promise<string[]> {
  if (tagIds.length === 0) return [];
  const owned = await db
    .select({ id: tag.id })
    .from(tag)
    .where(and(eq(tag.userId, userId), inArray(tag.id, [...tagIds])));
  return owned.map((r) => r.id);
}

export const recipeImport = {
  /**
   * Save an imported recipe with structured ingredient mappings.
   * Each ingredient line either maps to an existing ingredientId or creates
   * a new ingredient via createName.
   */
  saveWithMappings: defineAction({
    input: saveImportedRecipeSchema,
    handler: async (input, ctx) => {
      const user = requireUser(ctx);
      const db = getDb();

      const { recipe: recipeData, ingredientLines } = input;

      // Create recipe
      const [row] = await db
        .insert(recipe)
        .values({
          userId: user.id,
          title: recipeData.title,
          sourceUrl: recipeData.sourceUrl || null,
          imageUrl: recipeData.imageUrl || null,
          servings: recipeData.servings ?? null,
          prepTimeMinutes: recipeData.prepTimeMinutes ?? null,
          cookTimeMinutes: recipeData.cookTimeMinutes ?? null,
          totalTimeMinutes: recipeData.totalTimeMinutes ?? null,
          notes: recipeData.notes ?? null,
        })
        .returning({ id: recipe.id });
      if (!row) {
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create recipe",
        });
      }
      const recipeId = row.id;

      // Instructions
      if (recipeData.instructions.length > 0) {
        await db.insert(recipeInstruction).values(
          recipeData.instructions.map((text, sortOrder) => ({
            recipeId,
            sortOrder,
            text: text.trim() || "\u2014",
          })),
        );
      }

      // Ingredient lines with mapping
      for (const line of ingredientLines) {
        const structuredParse = parseIngredientLineStructured(
          line.originalLine,
        );
        const quantity =
          line.quantity ??
          (structuredParse.quantityDecimal != null &&
          Number.isFinite(structuredParse.quantityDecimal)
            ? structuredParse.quantityDecimal
            : null);
        const unitEnum =
          line.unit ??
          (structuredParse.unit
            ? (UNIT_FROM_LABEL[structuredParse.unit] ?? null)
            : null);
        const displayText =
          line.displayText?.trim() ||
          getDisplayTextFromIngredientLine(line.originalLine) ||
          line.originalLine;

        const hasMapping = !!(
          line.ingredientId?.trim() || line.createName?.trim()
        );
        if (!hasMapping) {
          await db.insert(recipeIngredient).values({
            recipeId,
            ingredientId: null,
            quantity,
            unit: unitEnum,
            displayText,
            rawText: line.originalLine,
            parseConfidence: structuredParse.parseConfidence,
            sortOrder: line.sortOrder,
            originalQuantity: quantity,
            originalUnit: unitEnum,
          });
          continue;
        }

        let ingredientId: string;
        if (line.ingredientId?.trim()) {
          // Verify ingredient exists and is accessible to user
          const [ing] = await db
            .select({
              id: ingredient.id,
              userId: ingredient.userId,
            })
            .from(ingredient)
            .where(eq(ingredient.id, line.ingredientId.trim()))
            .limit(1);
          if (!ing || (ing.userId !== null && ing.userId !== user.id)) {
            throw new ActionError({
              code: "FORBIDDEN",
              message:
                "An ingredient was not found or does not belong to you.",
            });
          }
          ingredientId = ing.id;
        } else {
          // Create or find ingredient by normalizedName
          const createName = line.createName!.trim();
          const normalizedName = normalizeIngredientName(createName);
          const [existing] = await db
            .select({ id: ingredient.id })
            .from(ingredient)
            .where(
              and(
                or(
                  isNull(ingredient.userId),
                  eq(ingredient.userId, user.id),
                ),
                eq(ingredient.normalizedName, normalizedName),
              ),
            )
            .limit(1);
          if (existing) {
            ingredientId = existing.id;
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
        }

        // Auto-convert to weight
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
          originalLine: line.originalLine,
        });

        await db.insert(recipeIngredient).values({
          recipeId,
          ingredientId,
          quantity,
          unit: unitEnum,
          displayText,
          rawText: line.originalLine,
          parseConfidence: structuredParse.parseConfidence,
          sortOrder: line.sortOrder,
          originalQuantity: quantity,
          originalUnit: unitEnum,
          weightGrams: converted.weightGrams ?? null,
          conversionSource: converted.conversionSource ?? null,
          conversionConfidence: converted.conversionConfidence ?? null,
          conversionNotes: converted.conversionNotes ?? null,
        });

        // Upsert alias for future matching
        const normalizedKey = normalizeIngredientName(
          line.originalLine.trim() ||
            line.createName?.trim() ||
            "",
        ).trim();
        if (normalizedKey) {
          // D1 doesn't support upsert with unique constraint as cleanly;
          // use insert-or-ignore then update pattern
          const [existingAlias] = await db
            .select({ id: ingredientAlias.id })
            .from(ingredientAlias)
            .where(eq(ingredientAlias.aliasNormalized, normalizedKey))
            .limit(1);
          if (existingAlias) {
            await db
              .update(ingredientAlias)
              .set({ ingredientId })
              .where(eq(ingredientAlias.id, existingAlias.id));
          } else {
            await db.insert(ingredientAlias).values({
              ingredientId,
              aliasNormalized: normalizedKey,
            });
          }
        }
      }

      // Tags
      const validTagIds = await filterOwnedTagIds(
        db,
        user.id,
        recipeData.tagIds,
      );
      if (validTagIds.length > 0) {
        await db
          .insert(recipeTag)
          .values(validTagIds.map((tagId) => ({ recipeId, tagId })));
      }

      return { recipeId };
    },
  }),

  /**
   * Save a recipe with raw text ingredient lines (no mapping).
   * Used for quick saves where the user skips ingredient mapping.
   */
  saveTextOnly: defineAction({
    input: saveImportedRecipeTextOnlySchema,
    handler: async (input, ctx) => {
      const user = requireUser(ctx);
      const db = getDb();

      const { recipe: recipeData, ingredients } = input;

      const [row] = await db
        .insert(recipe)
        .values({
          userId: user.id,
          title: recipeData.title,
          sourceUrl: recipeData.sourceUrl || null,
          imageUrl: recipeData.imageUrl || null,
          servings: recipeData.servings ?? null,
          prepTimeMinutes: recipeData.prepTimeMinutes ?? null,
          cookTimeMinutes: recipeData.cookTimeMinutes ?? null,
          totalTimeMinutes: recipeData.totalTimeMinutes ?? null,
          notes: recipeData.notes ?? null,
        })
        .returning({ id: recipe.id });
      if (!row) {
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create recipe",
        });
      }
      const recipeId = row.id;

      // Instructions
      if (recipeData.instructions.length > 0) {
        await db.insert(recipeInstruction).values(
          recipeData.instructions.map((text, sortOrder) => ({
            recipeId,
            sortOrder,
            text: text.trim() || "\u2014",
          })),
        );
      }

      // Raw ingredient lines
      if (ingredients.length > 0) {
        await db.insert(recipeIngredient).values(
          ingredients.map((line, i) => ({
            recipeId,
            ingredientId: null,
            quantity: null,
            unit: null,
            displayText: line.trim(),
            rawText: line.trim(),
            sortOrder: i,
          })),
        );
      }

      // Tags
      const validTagIds = await filterOwnedTagIds(
        db,
        user.id,
        recipeData.tagIds,
      );
      if (validTagIds.length > 0) {
        await db
          .insert(recipeTag)
          .values(validTagIds.map((tagId) => ({ recipeId, tagId })));
      }

      return { recipeId };
    },
  }),
};
