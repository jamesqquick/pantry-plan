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
import { chunkRows } from "@/db/chunked-insert";
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

      // ── Batch-process ingredient lines ──
      // Pre-compute structured parse data for every line so we can build
      // all INSERT rows in memory and issue a single batch query.
      const parsedLines = ingredientLines.map((line) => {
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
        return { line, structuredParse, quantity, unitEnum, displayText };
      });

      // 1. Lines without a mapping → raw text only
      const unmappedRows = parsedLines
        .filter(({ line }) => !line.ingredientId?.trim() && !line.createName?.trim())
        .map(({ line, structuredParse, quantity, unitEnum, displayText }) => ({
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
        }));

      // 2. Verify all referenced ingredientIds in one query
      const mappedById = parsedLines.filter(({ line }) => line.ingredientId?.trim());
      const idSet = [...new Set(mappedById.map(({ line }) => line.ingredientId!.trim()))];
      const verifiedById = idSet.length
        ? await db
            .select({ id: ingredient.id, userId: ingredient.userId })
            .from(ingredient)
            .where(
              and(
                inArray(ingredient.id, idSet),
                or(isNull(ingredient.userId), eq(ingredient.userId, user.id)),
              ),
            )
        : [];
      if (verifiedById.length !== idSet.length) {
        throw new ActionError({
          code: "FORBIDDEN",
          message: "An ingredient was not found or does not belong to you.",
        });
      }
      const idToIngredientId = new Map(verifiedById.map((i) => [i.id, i.id]));

      // 3. Resolve createName lines (find existing or create new)
      const mappedByName = parsedLines.filter(({ line }) => line.createName?.trim());
      const nameMap = new Map(
        mappedByName.map(({ line }) => [
          line.createName!.trim(),
          normalizeIngredientName(line.createName!.trim()),
        ]),
      );
      const normalizedNames = [...new Set(nameMap.values())];
      const existingByName = normalizedNames.length
        ? await db
            .select({ id: ingredient.id, normalizedName: ingredient.normalizedName })
            .from(ingredient)
            .where(
              and(
                or(isNull(ingredient.userId), eq(ingredient.userId, user.id)),
                inArray(ingredient.normalizedName, normalizedNames),
              ),
            )
        : [];
      const existingNameToId = new Map(
        existingByName.map((i) => [i.normalizedName, i.id]),
      );
      const namesToCreate = normalizedNames.filter((n) => !existingNameToId.has(n));
      const createdIngredients = namesToCreate.length
        ? await db
            .insert(ingredient)
            .values(
              namesToCreate.map((normalizedName) => {
                const createName = [...nameMap.entries()].find(
                  ([, n]) => n === normalizedName,
                )![0];
                return {
                  userId: user.id,
                  name: createName,
                  normalizedName,
                  costBasisUnit: "G" as const,
                };
              }),
            )
            .returning({ id: ingredient.id, normalizedName: ingredient.normalizedName })
        : [];
      const nameToIngredientId = new Map([
        ...existingNameToId,
        ...createdIngredients.map((i) => [i.normalizedName, i.id] as const),
      ]);

      // 4. Collect every ingredientId we need conversion data for
      const allIngredientIds = [
        ...verifiedById.map((i) => i.id),
        ...createdIngredients.map((i) => i.id),
      ];
      const convertData = allIngredientIds.length
        ? await db
            .select({
              id: ingredient.id,
              normalizedName: ingredient.normalizedName,
              gramsPerCup: ingredient.gramsPerCup,
            })
            .from(ingredient)
            .where(inArray(ingredient.id, allIngredientIds))
        : [];
      const convertById = new Map(convertData.map((i) => [i.id, i]));

      // 5. Build recipeIngredient rows for mapped lines
      const mappedRows = parsedLines
        .filter(({ line }) => line.ingredientId?.trim() || line.createName?.trim())
        .map(({ line, structuredParse, quantity, unitEnum, displayText }) => {
          const ingredientId = line.ingredientId?.trim()
            ? idToIngredientId.get(line.ingredientId.trim())!
            : nameToIngredientId.get(
                normalizeIngredientName(line.createName!.trim()),
              )!;
          const ing = convertById.get(ingredientId);
          const converted = autoConvert({
            quantity: quantity ?? 1,
            unit: unitEnum ?? null,
            ingredient: ing ?? { normalizedName: null, gramsPerCup: null },
            originalLine: line.originalLine,
          });
          return {
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
          };
        });

      // 6. Build all recipeIngredient rows
      const allRecipeIngredientRows = [...unmappedRows, ...mappedRows];

      // 7. Resolve tags
      const validTagIds = await filterOwnedTagIds(
        db,
        user.id,
        recipeData.tagIds,
      );

      // 8. Atomically insert instructions + ingredients + tags.
      // If any of these fail, D1 rolls back the entire batch so the
      // recipe won't exist as a partial entity.
      //
      // Each row binds one parameter per column (plus `id` from cuidPk).
      // D1 limits bound parameters per statement (~100), so we chunk
      // each bulk insert into multiple statements that all run in the
      // same batch. Param-per-row counts:
      //   recipeInstruction: 4 (id, recipeId, sortOrder, text)
      //   recipeIngredient (mapped): 15
      //   recipeTag: 3 (id, recipeId, tagId)
      const instructionRows = recipeData.instructions.map(
        (text, sortOrder) => ({
          recipeId,
          sortOrder,
          text: text.trim() || "\u2014",
        }),
      );
      const tagRows = validTagIds.map((tagId) => ({ recipeId, tagId }));

      const batchQueries = [
        ...chunkRows(instructionRows, 4).map((chunk) =>
          db.insert(recipeInstruction).values(chunk),
        ),
        ...chunkRows(allRecipeIngredientRows, 15).map((chunk) =>
          db.insert(recipeIngredient).values(chunk),
        ),
        ...chunkRows(tagRows, 3).map((chunk) =>
          db.insert(recipeTag).values(chunk),
        ),
      ];
      if (batchQueries.length > 0) {
        await db.batch(
          batchQueries as [
            (typeof batchQueries)[0],
            ...typeof batchQueries,
          ],
        );
      }

      // 9. Upsert aliases (best-effort; not tied to recipe atomicity)
      const aliasEntries = parsedLines
        .map(({ line }) => {
          const key = normalizeIngredientName(
            line.originalLine.trim() || line.createName?.trim() || "",
          ).trim();
          if (!key) return null;
          const ingredientId = line.ingredientId?.trim()
            ? idToIngredientId.get(line.ingredientId.trim())!
            : line.createName?.trim()
              ? nameToIngredientId.get(normalizeIngredientName(line.createName.trim()))!
              : null;
          if (!ingredientId) return null;
          return { key, ingredientId };
        })
        .filter((e): e is { key: string; ingredientId: string } => e !== null);

      const aliasKeys = [...new Set(aliasEntries.map((e) => e.key))];
      const existingAliases = aliasKeys.length
        ? await db
            .select({ id: ingredientAlias.id, aliasNormalized: ingredientAlias.aliasNormalized })
            .from(ingredientAlias)
            .where(inArray(ingredientAlias.aliasNormalized, aliasKeys))
        : [];
      const existingAliasSet = new Set(existingAliases.map((a) => a.aliasNormalized));

      const aliasUpdates = existingAliases.map((alias) => ({
        id: alias.id,
        ingredientId: aliasEntries.find((e) => e.key === alias.aliasNormalized)!.ingredientId,
      }));
      for (const { id, ingredientId } of aliasUpdates) {
        await db
          .update(ingredientAlias)
          .set({ ingredientId })
          .where(eq(ingredientAlias.id, id));
      }

      const aliasInserts = aliasEntries
        .filter((e) => !existingAliasSet.has(e.key))
        .map((e) => ({
          ingredientId: e.ingredientId,
          aliasNormalized: e.key,
        }));
      // ingredientAlias: 3 params/row (id, ingredientId, aliasNormalized)
      for (const chunk of chunkRows(aliasInserts, 3)) {
        await db.insert(ingredientAlias).values(chunk);
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

      // Resolve tags before the atomic batch
      const validTagIds = await filterOwnedTagIds(
        db,
        user.id,
        recipeData.tagIds,
      );

      // Atomically insert instructions + ingredients + tags.
      // D1 guarantees all statements in a batch succeed or fail together.
      // Param-per-row counts (incl. cuid id from $defaultFn):
      //   recipeInstruction: 4, recipeIngredient (text-only): 8, recipeTag: 3
      const instructionRows = recipeData.instructions.map(
        (text, sortOrder) => ({
          recipeId,
          sortOrder,
          text: text.trim() || "\u2014",
        }),
      );
      const ingredientRows = ingredients.map((line, i) => ({
        recipeId,
        ingredientId: null,
        quantity: null,
        unit: null,
        displayText: line.trim(),
        rawText: line.trim(),
        sortOrder: i,
      }));
      const tagRows = validTagIds.map((tagId) => ({ recipeId, tagId }));

      const batchQueries = [
        ...chunkRows(instructionRows, 4).map((chunk) =>
          db.insert(recipeInstruction).values(chunk),
        ),
        ...chunkRows(ingredientRows, 8).map((chunk) =>
          db.insert(recipeIngredient).values(chunk),
        ),
        ...chunkRows(tagRows, 3).map((chunk) =>
          db.insert(recipeTag).values(chunk),
        ),
      ];
      if (batchQueries.length > 0) {
        await db.batch(
          batchQueries as [
            (typeof batchQueries)[0],
            ...typeof batchQueries,
          ],
        );
      }

      return { recipeId };
    },
  }),
};
