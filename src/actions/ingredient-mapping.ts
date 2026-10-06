import { createId } from "@paralleldrive/cuid2";
import { ActionError, defineAction } from "astro:actions";
import { env } from "cloudflare:workers";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { ingredient, recipe, recipeIngredient } from "@/db";
import { chunkRows } from "@/db/chunked-insert";
import { chunkInValues } from "@/db/chunked-read";
import type { IngredientUnit } from "@/db/schema/enums";
import {
  ingredientMappingApplySchema,
  ingredientMappingPreviewSchema,
} from "@/features/recipes/ingredient-mapping.schemas";
import { getDisplayTextFromIngredientLine } from "@/lib/ingredients/parse-ingredient-line-structured";
import { normalizeIngredientName } from "@/lib/ingredients/normalize";
import { autoConvert } from "@/lib/measurements/auto-convert";
import {
  buildPreferredIngredientMap,
  deriveRecipeIngredientMappingUpdate,
  getRecipeMappingPreviewFields,
  getTenantScopedCurrentIngredient,
  getUnmappedSuggestionLines,
  NEW_INGREDIENT_INSERT_PARAMS_PER_ROW,
  recipeMappingVersionsMatch,
  type RecipeIngredientMappingUpdateRow,
  validateRecipeMappingItemSet,
} from "@/lib/ingredients/recipe-mapping";
import { suggestIngredientMappings } from "@/lib/ingredients/suggest-ingredient-mappings";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getDb, queueSearchSync, requireUser } from "./_shared";

type PreviewIngredient = {
  id: string;
  name: string;
};

type PreviewSuggestedIngredient = PreviewIngredient & {
  normalizedName: string;
  matchType: "current" | "exact" | "alias" | "fuzzy" | "llm";
};

type VersionedRecipeIngredientMappingUpdate =
  RecipeIngredientMappingUpdateRow & {
    expectedUpdatedAt: number;
    nextUpdatedAt: number;
  };

export type RecipeIngredientMappingPreviewItem = {
  recipeIngredientId: string;
  recipeIngredientUpdatedAt: number;
  rawText: string;
  displayText: string;
  quantity: number | null;
  unit: IngredientUnit | null;
  currentIngredient: PreviewIngredient | null;
  normalizedKey: string;
  suggestedIngredient: PreviewSuggestedIngredient | null;
  suggestedCreateName: string | null;
  candidates: Array<{
    id: string;
    name: string;
    matchType: "exact" | "alias" | "fuzzy";
    score?: number;
  }>;
};

export type RecipeIngredientMappingPreview = {
  recipeId: string;
  automaticMappingWarning: string | null;
  items: RecipeIngredientMappingPreviewItem[];
};

const AUTOMATIC_MAPPING_WARNING =
  "Automatic AI suggestions are temporarily unavailable. Deterministic matches are still shown; review the remaining ingredients manually.";

function recipeOwnerScope(recipeId: string, userId: string) {
  return and(eq(recipe.id, recipeId), eq(recipe.userId, userId));
}

function prepareIngredientInsert(
  rows: ReadonlyArray<{
    id: string;
    userId: string;
    name: string;
    normalizedName: string;
    costBasisUnit: "G";
  }>,
) {
  const placeholders = rows.map(() => "(?, ?, ?, ?, ?)").join(", ");
  const values = rows.flatMap((row) => [
    row.id,
    row.userId,
    row.name,
    row.normalizedName,
    row.costBasisUnit,
  ]);

  return env.DB.prepare(
    `INSERT INTO "Ingredient" ("id", "userId", "name", "normalizedName", "costBasisUnit") VALUES ${placeholders}`,
  ).bind(...values);
}

function prepareRecipeIngredientUpdates(
  recipeId: string,
  rows: readonly VersionedRecipeIngredientMappingUpdate[],
) {
  return env.DB.prepare(
    `WITH updates (
      "id", "ingredientId", "quantity", "unit", "displayText",
      "originalQuantity", "originalUnit", "weightGrams", "conversionSource",
      "conversionConfidence", "conversionNotes", "expectedUpdatedAt", "nextUpdatedAt"
    ) AS (
      SELECT
        json_extract(value, '$.id'),
        json_extract(value, '$.ingredientId'),
        json_extract(value, '$.quantity'),
        json_extract(value, '$.unit'),
        json_extract(value, '$.displayText'),
        json_extract(value, '$.originalQuantity'),
        json_extract(value, '$.originalUnit'),
        json_extract(value, '$.weightGrams'),
        json_extract(value, '$.conversionSource'),
        json_extract(value, '$.conversionConfidence'),
        json_extract(value, '$.conversionNotes'),
        json_extract(value, '$.expectedUpdatedAt'),
        json_extract(value, '$.nextUpdatedAt')
      FROM json_each(?)
    )
    UPDATE "RecipeIngredient"
    SET (
      "ingredientId", "quantity", "unit", "displayText", "originalQuantity",
      "originalUnit", "weightGrams", "conversionSource", "conversionConfidence",
      "conversionNotes"
    ) = (
      SELECT
        updates."ingredientId", updates."quantity", updates."unit", updates."displayText",
        updates."originalQuantity", updates."originalUnit", updates."weightGrams",
        updates."conversionSource", updates."conversionConfidence", updates."conversionNotes"
      FROM updates
      WHERE updates."id" = "RecipeIngredient"."id"
    ),
    "updatedAt" = (
      SELECT updates."nextUpdatedAt"
      FROM updates
      WHERE updates."id" = "RecipeIngredient"."id"
    )
    WHERE "recipeId" = ?
      AND "id" IN (SELECT "id" FROM updates)
      AND (
        SELECT count(*)
        FROM "RecipeIngredient" current
        INNER JOIN updates
          ON updates."id" = current."id"
          AND updates."expectedUpdatedAt" = current."updatedAt"
        WHERE current."recipeId" = ?
      ) = ?`,
  ).bind(JSON.stringify(rows), recipeId, recipeId, rows.length);
}

function prepareRecipeIngredientVersionGuard(
  recipeId: string,
  rows: readonly { id: string; updatedAt: number }[],
) {
  // Invalid JSON deliberately aborts the D1 batch so no writes can commit.
  return env.DB.prepare(
    `WITH expected ("id", "updatedAt") AS (
       SELECT
         json_extract(value, '$.id'),
         json_extract(value, '$.updatedAt')
       FROM json_each(?)
     )
     SELECT CASE
       WHEN (
         SELECT count(*)
         FROM "RecipeIngredient" current
         INNER JOIN expected
           ON expected."id" = current."id"
           AND expected."updatedAt" = current."updatedAt"
         WHERE current."recipeId" = ?
       ) = ? AND (
         SELECT count(*)
         FROM "RecipeIngredient"
         WHERE "recipeId" = ?
       ) = ?
       THEN 1
       ELSE json('')
     END AS "valid"`,
  ).bind(JSON.stringify(rows), recipeId, rows.length, recipeId, rows.length);
}

export const ingredientMapping = {
  previewRecipe: defineAction({
    input: ingredientMappingPreviewSchema,
    handler: async (input, ctx): Promise<RecipeIngredientMappingPreview> => {
      const user = requireUser(ctx);

      const db = getDb();
      const [ownedRecipe] = await db
        .select({ id: recipe.id })
        .from(recipe)
        .where(recipeOwnerScope(input.recipeId, user.id))
        .limit(1);
      if (!ownedRecipe) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Recipe not found.",
        });
      }

      const rows = await db
        .select({
          id: recipeIngredient.id,
          updatedAt: recipeIngredient.updatedAt,
          rawText: recipeIngredient.rawText,
          displayText: recipeIngredient.displayText,
          quantity: recipeIngredient.quantity,
          unit: recipeIngredient.unit,
          ingredientId: ingredient.id,
          ingredientName: ingredient.name,
          ingredientNormalizedName: ingredient.normalizedName,
          ingredientUserId: ingredient.userId,
        })
        .from(recipeIngredient)
        .leftJoin(
          ingredient,
          and(
            eq(recipeIngredient.ingredientId, ingredient.id),
            or(isNull(ingredient.userId), eq(ingredient.userId, user.id)),
          ),
        )
        .where(eq(recipeIngredient.recipeId, ownedRecipe.id))
        .orderBy(recipeIngredient.sortOrder);

      const previewRows = rows.map((row) => ({
        row,
        line:
          (row.rawText ?? row.displayText).trim() || row.displayText.trim(),
        scopedCurrentIngredient: getTenantScopedCurrentIngredient(
          {
            id: row.ingredientId,
            name: row.ingredientName,
            normalizedName: row.ingredientNormalizedName,
            userId: row.ingredientUserId,
          },
          user.id,
        ),
      }));
      const unresolvedRows = getUnmappedSuggestionLines(
        previewRows.map((previewRow) => ({
          line: previewRow.line,
          currentIngredientId:
            previewRow.scopedCurrentIngredient?.id ?? null,
        })),
      );
      const suggestionResult =
        unresolvedRows.length === 0
          ? { suggestions: [], aiStatus: "not-needed" as const }
          : await suggestIngredientMappings(
              db,
              unresolvedRows.map(({ line }) => line),
              user.id,
              env.AI,
              () =>
                enforceRateLimit(
                  env.AI_RATE_LIMIT,
                  `ai:ingredient-mapping:${user.id}`,
                ),
            );
      const unresolvedSuggestions = suggestionResult.suggestions;
      const suggestionByRowIndex = new Map(
        unresolvedRows.map(({ rowIndex }, suggestionIndex) => [
          rowIndex,
          unresolvedSuggestions[suggestionIndex]!,
        ]),
      );

      return {
        recipeId: ownedRecipe.id,
        automaticMappingWarning:
          suggestionResult.aiStatus === "failed" ||
          suggestionResult.aiStatus === "unavailable"
            ? AUTOMATIC_MAPPING_WARNING
            : null,
        items: previewRows.map(
          ({ row, line, scopedCurrentIngredient }, index) => {
            const suggestion = suggestionByRowIndex.get(index) ?? null;
            const currentIngredient = scopedCurrentIngredient
              ? {
                  id: scopedCurrentIngredient.id,
                  name: scopedCurrentIngredient.name,
                }
              : null;
            const suggestedIngredient: PreviewSuggestedIngredient | null =
              scopedCurrentIngredient
                ? {
                    id: scopedCurrentIngredient.id,
                    name: scopedCurrentIngredient.name,
                    normalizedName: scopedCurrentIngredient.normalizedName,
                    matchType: "current",
                  }
                : (suggestion?.suggestedIngredient ?? null);
            const quantity = suggestion?.parsed?.quantity;
            const previewFields = currentIngredient
              ? {
                  displayText: row.displayText,
                  quantity: row.quantity,
                  unit: row.unit,
                }
              : getRecipeMappingPreviewFields({
                  isMapped: false,
                  rawText: line,
                  storedDisplayText: row.displayText,
                  storedQuantity: row.quantity,
                  storedUnit: row.unit,
                  parsedDisplayText: getDisplayTextFromIngredientLine(line),
                  parsedQuantity:
                    quantity != null && Number.isFinite(quantity)
                      ? quantity
                      : null,
                  parsedUnit: suggestion?.parsed?.unit ?? null,
                });

            return {
              recipeIngredientId: row.id,
              recipeIngredientUpdatedAt: row.updatedAt.getTime(),
              rawText: line,
              displayText: previewFields.displayText,
              quantity: previewFields.quantity,
              unit: previewFields.unit,
              currentIngredient,
              normalizedKey:
                scopedCurrentIngredient?.normalizedName ??
                suggestion?.normalizedKey ??
                normalizeIngredientName(row.displayText),
              suggestedIngredient,
              suggestedCreateName: currentIngredient
                ? null
                : (suggestion?.suggestedCreateName?.trim() ?? null),
              candidates: currentIngredient
                ? []
                : (suggestion?.candidates ?? []),
            };
          },
        ),
      };
    },
  }),

  applyRecipe: defineAction({
    input: ingredientMappingApplySchema,
    handler: async (input, ctx) => {
      const user = requireUser(ctx);
      const db = getDb();

      const [ownedRecipe] = await db
        .select({ id: recipe.id })
        .from(recipe)
        .where(recipeOwnerScope(input.recipeId, user.id))
        .limit(1);
      if (!ownedRecipe) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Recipe not found.",
        });
      }

      const currentRows = await db
        .select({
          id: recipeIngredient.id,
          updatedAt: recipeIngredient.updatedAt,
          ingredientId: recipeIngredient.ingredientId,
          quantity: recipeIngredient.quantity,
          unit: recipeIngredient.unit,
          displayText: recipeIngredient.displayText,
          originalQuantity: recipeIngredient.originalQuantity,
          originalUnit: recipeIngredient.originalUnit,
          weightGrams: recipeIngredient.weightGrams,
          conversionSource: recipeIngredient.conversionSource,
          conversionConfidence: recipeIngredient.conversionConfidence,
          conversionNotes: recipeIngredient.conversionNotes,
          rawText: recipeIngredient.rawText,
        })
        .from(recipeIngredient)
        .where(eq(recipeIngredient.recipeId, ownedRecipe.id));
      const itemSetValidation = validateRecipeMappingItemSet(
        currentRows.map((row) => row.id),
        input.items.map((item) => item.recipeIngredientId),
      );
      if (!itemSetValidation.ok) {
        if (itemSetValidation.reason === "duplicate") {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: "Each recipe ingredient can only be updated once.",
          });
        }
        throw new ActionError({
          code: "CONFLICT",
          message: "Recipe ingredients changed. Refresh and try again.",
        });
      }

      const currentRowById = new Map(currentRows.map((row) => [row.id, row]));
      const submittedVersions = input.items.map((item) => ({
        id: item.recipeIngredientId,
        updatedAt: item.recipeIngredientUpdatedAt,
      }));
      if (
        !recipeMappingVersionsMatch(
          currentRows.map((row) => ({
            id: row.id,
            updatedAt: row.updatedAt.getTime(),
          })),
          submittedVersions,
        )
      ) {
        throw new ActionError({
          code: "CONFLICT",
          message: "Recipe ingredients changed. Refresh and try again.",
        });
      }

      const existingIngredientIds = [
        ...new Set(
          input.items.flatMap((item) =>
            item.mapping.kind === "existing"
              ? [item.mapping.ingredientId]
              : [],
          ),
        ),
      ];
      const accessibleExistingIngredients: Array<{
        id: string;
        normalizedName: string;
        gramsPerCup: number | null;
      }> = [];
      for (const ingredientIds of chunkInValues(existingIngredientIds, 1)) {
        const rows = await db
          .select({
            id: ingredient.id,
            normalizedName: ingredient.normalizedName,
            gramsPerCup: ingredient.gramsPerCup,
          })
          .from(ingredient)
          .where(
            and(
              inArray(ingredient.id, ingredientIds),
              or(isNull(ingredient.userId), eq(ingredient.userId, user.id)),
            ),
          );
        accessibleExistingIngredients.push(...rows);
      }
      if (
        accessibleExistingIngredients.length !== existingIngredientIds.length
      ) {
        throw new ActionError({
          code: "FORBIDDEN",
          message: "An ingredient was not found or does not belong to you.",
        });
      }

      const createNames = new Map<string, string>();
      for (const item of input.items) {
        if (item.mapping.kind !== "create") continue;
        const normalizedName = normalizeIngredientName(item.mapping.name);
        if (!normalizedName) {
          throw new ActionError({
            code: "BAD_REQUEST",
            message: "Ingredient name must contain letters or numbers.",
          });
        }
        if (!createNames.has(normalizedName)) {
          createNames.set(normalizedName, item.mapping.name);
        }
      }

      const normalizedNames = [...createNames.keys()];
      const matchingIngredients: Array<{
        id: string;
        normalizedName: string;
        userId: string | null;
        gramsPerCup: number | null;
      }> = [];
      for (const names of chunkInValues(normalizedNames, 1)) {
        const rows = await db
          .select({
            id: ingredient.id,
            normalizedName: ingredient.normalizedName,
            userId: ingredient.userId,
            gramsPerCup: ingredient.gramsPerCup,
          })
          .from(ingredient)
          .where(
            and(
              inArray(ingredient.normalizedName, names),
              or(isNull(ingredient.userId), eq(ingredient.userId, user.id)),
            ),
          );
        matchingIngredients.push(...rows);
      }
      const preferredIngredients = buildPreferredIngredientMap(
        matchingIngredients,
        user.id,
      );
      const newIngredients = normalizedNames
        .filter((normalizedName) => !preferredIngredients.has(normalizedName))
        .map((normalizedName) => ({
          id: createId(),
          userId: user.id,
          name: createNames.get(normalizedName)!,
          normalizedName,
          costBasisUnit: "G" as const,
        }));
      const ingredientIdByNormalizedName = new Map(
        [...preferredIngredients].map(([normalizedName, row]) => [
          normalizedName,
          row.id,
        ]),
      );
      for (const row of newIngredients) {
        ingredientIdByNormalizedName.set(row.normalizedName, row.id);
      }
      const conversionIngredientById = new Map(
        [
          ...accessibleExistingIngredients,
          ...matchingIngredients,
          ...newIngredients.map((row) => ({
            id: row.id,
            normalizedName: row.normalizedName,
            gramsPerCup: null,
          })),
        ].map((row) => [row.id, row]),
      );

      let mappedCount = 0;
      const applyTimestamp = Date.now();
      const updates = input.items.flatMap((item) => {
        let ingredientId: string | null = null;
        if (item.mapping.kind === "existing") {
          ingredientId = item.mapping.ingredientId;
        } else if (item.mapping.kind === "create") {
          ingredientId =
            ingredientIdByNormalizedName.get(
              normalizeIngredientName(item.mapping.name),
            ) ?? null;
          if (!ingredientId) {
            throw new ActionError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to resolve ingredient mapping.",
            });
          }
        }
        if (ingredientId) mappedCount += 1;

        const currentRow = currentRowById.get(item.recipeIngredientId)!;
        const structureChanged =
          currentRow.ingredientId !== ingredientId ||
          currentRow.quantity !== (item.quantity ?? null) ||
          currentRow.unit !== (item.unit ?? null);
        const converted =
          structureChanged && ingredientId
            ? autoConvert({
                quantity: item.quantity ?? 1,
                unit: item.unit ?? null,
                ingredient: conversionIngredientById.get(ingredientId) ?? {
                  normalizedName: null,
                  gramsPerCup: null,
                },
                originalLine: currentRow.rawText ?? item.displayText,
              })
            : null;
        const update = deriveRecipeIngredientMappingUpdate(
          currentRow,
          {
            ingredientId,
            quantity: item.quantity ?? null,
            unit: item.unit ?? null,
            displayText: item.displayText,
          },
          converted
            ? {
                weightGrams: converted.weightGrams ?? null,
                conversionSource: converted.conversionSource ?? null,
                conversionConfidence: converted.conversionConfidence ?? null,
                conversionNotes: converted.conversionNotes ?? null,
              }
            : undefined,
        );
        return update
          ? [
              {
                ...update,
                expectedUpdatedAt: item.recipeIngredientUpdatedAt,
                nextUpdatedAt: Math.max(
                  applyTimestamp,
                  item.recipeIngredientUpdatedAt + 1,
                ),
              },
            ]
          : [];
      });
      const updateStatement =
        updates.length > 0
          ? prepareRecipeIngredientUpdates(ownedRecipe.id, updates)
          : null;
      const batchStatements = [
        prepareRecipeIngredientVersionGuard(
          ownedRecipe.id,
          submittedVersions,
        ),
        ...chunkRows(
          newIngredients,
          NEW_INGREDIENT_INSERT_PARAMS_PER_ROW,
        ).map(prepareIngredientInsert),
        ...(updateStatement ? [updateStatement] : []),
      ];
      try {
        await env.DB.batch(batchStatements);
      } catch (error) {
        const latestRows = await db
          .select({
            id: recipeIngredient.id,
            updatedAt: recipeIngredient.updatedAt,
          })
          .from(recipeIngredient)
          .where(eq(recipeIngredient.recipeId, ownedRecipe.id));
        if (
          !recipeMappingVersionsMatch(
            latestRows.map((row) => ({
              id: row.id,
              updatedAt: row.updatedAt.getTime(),
            })),
            submittedVersions,
          )
        ) {
          throw new ActionError({
            code: "CONFLICT",
            message: "Recipe ingredients changed. Refresh and try again.",
          });
        }
        throw error;
      }

      await queueSearchSync(ctx, db, [ownedRecipe.id]);
      return {
        recipeId: ownedRecipe.id,
        mappedCount,
        totalCount: input.items.length,
      };
    },
  }),
};
