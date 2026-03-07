"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { getAuthenticatedUser } from "@/app/actions/_shared";
import { zodToFieldErrors } from "@/lib/action-helpers";
import type { ActionResult } from "@/lib/action-helpers";
import { saveImportedRecipeSchema, saveImportedRecipeTextOnlySchema } from "@/features/import/import.schemas";
import { normalizeIngredientName } from "@/lib/ingredients/normalize";
import { UNIT_FROM_LABEL } from "@/lib/ingredients/units";
import { autoConvert } from "@/lib/measurements/auto-convert";
import {
  parseIngredientLineStructured,
  getDisplayTextFromIngredientLine,
} from "@/lib/ingredients/parse-ingredient-line-structured";

export async function saveImportedRecipeWithMappingsAction(
  raw: unknown
): Promise<ActionResult<{ recipeId: string }>> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;
  const user = userResult.data;

  const parsed = saveImportedRecipeSchema.safeParse(raw);
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

  const { recipe: recipeData, ingredientLines } = parsed.data;
  const rawIngredientLines = ingredientLines.map((l) => l.originalLine);

  const db = getDb();
  let recipeId: string;
  try {
    recipeId = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const recipe = await tx.recipe.create({
        data: {
          userId: user.id,
          title: recipeData.title,
          sourceUrl: recipeData.sourceUrl || null,
          imageUrl: recipeData.imageUrl || null,
          servings: recipeData.servings ?? null,
          prepTimeMinutes: recipeData.prepTimeMinutes ?? null,
          cookTimeMinutes: recipeData.cookTimeMinutes ?? null,
          totalTimeMinutes: recipeData.totalTimeMinutes ?? null,
          notes: recipeData.notes ?? null,
        },
      });

      const instructionSteps = recipeData.instructions ?? [];
      if (instructionSteps.length > 0) {
        await tx.recipeInstruction.createMany({
          data: instructionSteps.map((text, sortOrder) => ({
            recipeId: recipe.id,
            sortOrder,
            text: text.trim() || "—",
          })),
        });
      }

      for (let i = 0; i < ingredientLines.length; i++) {
        const line = ingredientLines[i];
        const structuredParse = parseIngredientLineStructured(line.originalLine);
        const quantity =
          line.quantity ??
          (structuredParse.quantityDecimal != null && Number.isFinite(structuredParse.quantityDecimal)
            ? structuredParse.quantityDecimal
            : null);
        const unitEnum =
          line.unit ??
          (structuredParse.unit ? UNIT_FROM_LABEL[structuredParse.unit] ?? null : null);
        const displayText =
          (line as { displayText?: string }).displayText?.trim() ||
          getDisplayTextFromIngredientLine(line.originalLine) ||
          line.originalLine;

        const hasMapping = !!(line.ingredientId?.trim() || line.createName?.trim());
        if (!hasMapping) {
          await tx.recipeIngredient.create({
            data: {
              recipeId: recipe.id,
              ingredientId: null,
              quantity,
              unit: unitEnum,
              displayText,
              rawText: line.originalLine,
              parseConfidence: structuredParse.parseConfidence,
              sortOrder: line.sortOrder,
              originalQuantity: quantity,
              originalUnit: unitEnum,
            },
          });
          continue;
        }

        let ingredientId: string;
        if (line.ingredientId?.trim()) {
          const ing = await tx.ingredient.findUnique({
            where: { id: line.ingredientId.trim() },
          });
          if (!ing || (ing.userId !== null && ing.userId !== user.id)) {
            throw new Error("FORBIDDEN");
          }
          ingredientId = ing.id;
        } else {
          const createName = line.createName!.trim();
          const normalizedName = normalizeIngredientName(createName);
          const existing = await tx.ingredient.findFirst({
            where: {
              OR: [{ userId: null, normalizedName }, { userId: user.id, normalizedName }],
            },
          });
          if (existing) {
            ingredientId = existing.id;
          } else {
            const created = await tx.ingredient.create({
              data: {
                userId: user.id,
                name: createName,
                normalizedName,
                costBasisUnit: "GRAM",
              },
            });
            ingredientId = created.id;
          }
        }

        const ingredientForConvert = await tx.ingredient.findUnique({
          where: { id: ingredientId },
          select: { normalizedName: true, gramsPerCup: true },
        });
        const ingredientForConvertPlain = ingredientForConvert
          ? {
              normalizedName: ingredientForConvert.normalizedName,
              gramsPerCup: ingredientForConvert.gramsPerCup != null ? Number(ingredientForConvert.gramsPerCup) : null,
            }
          : { normalizedName: null, gramsPerCup: null };
        const converted = autoConvert({
          quantity: quantity ?? 1,
          unit: unitEnum ?? null,
          ingredient: ingredientForConvertPlain,
          originalLine: line.originalLine,
        });

        const normalizedKey = normalizeIngredientName(line.originalLine.trim() || line.createName?.trim() || "");

        await tx.recipeIngredient.create({
          data: {
            recipeId: recipe.id,
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
          },
        });

        const aliasNorm = normalizedKey.trim() || normalizeIngredientName(line.createName?.trim() || line.originalLine).trim();
        if (aliasNorm) {
          await tx.ingredientAlias.upsert({
            where: { aliasNormalized: aliasNorm },
            create: {
              ingredientId,
              aliasNormalized: aliasNorm,
            },
            update: { ingredientId },
          });
        }
      }

      const tagIds = recipeData.tagIds ?? [];
      if (tagIds.length > 0) {
        const userTags = await tx.tag.findMany({
          where: { userId: user.id },
          select: { id: true },
        });
        type TagRow = (typeof userTags)[number];
        const allowedTagIds = new Set(userTags.map((t: TagRow) => t.id));
        const validTagIds = tagIds.filter((id: string) => allowedTagIds.has(id));
        if (validTagIds.length > 0) {
          await tx.recipeTag.createMany({
            data: validTagIds.map((tagId: string) => ({ recipeId: recipe.id, tagId })),
          });
        }
      }

      return recipe.id;
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Transaction failed";
    if (msg === "FORBIDDEN") {
      return { ok: false, error: { code: "FORBIDDEN", message: "An ingredient was not found or does not belong to you." } };
    }
    throw err;
  }

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/recipes/new");
  return { ok: true, data: { recipeId } };
}

export async function saveImportedRecipeTextOnlyAction(
  raw: unknown
): Promise<ActionResult<{ recipeId: string }>> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;
  const user = userResult.data;

  const parsed = saveImportedRecipeTextOnlySchema.safeParse(raw);
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

  const { recipe: recipeData, ingredients } = parsed.data;
  const db = getDb();

  const recipeId = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const recipe = await tx.recipe.create({
      data: {
        userId: user.id,
        title: recipeData.title,
        sourceUrl: recipeData.sourceUrl || null,
        imageUrl: recipeData.imageUrl || null,
        servings: recipeData.servings ?? null,
        prepTimeMinutes: recipeData.prepTimeMinutes ?? null,
        cookTimeMinutes: recipeData.cookTimeMinutes ?? null,
        totalTimeMinutes: recipeData.totalTimeMinutes ?? null,
        notes: recipeData.notes ?? null,
      },
    });

    const instructionSteps = recipeData.instructions ?? [];
    if (instructionSteps.length > 0) {
      await tx.recipeInstruction.createMany({
        data: instructionSteps.map((text, sortOrder) => ({
          recipeId: recipe.id,
          sortOrder,
          text: text.trim() || "—",
        })),
      });
    }

    for (let i = 0; i < ingredients.length; i++) {
      const line = ingredients[i].trim();
      await tx.recipeIngredient.create({
        data: {
          recipeId: recipe.id,
          ingredientId: null,
          quantity: null,
          unit: null,
          displayText: line,
          rawText: line,
          sortOrder: i,
        },
      });
    }

    const tagIds = recipeData.tagIds ?? [];
    if (tagIds.length > 0) {
      const userTags = await tx.tag.findMany({
        where: { userId: user.id },
        select: { id: true },
      });
      type TagRow = (typeof userTags)[number];
      const allowedTagIds = new Set(userTags.map((t: TagRow) => t.id));
      const validTagIds = tagIds.filter((id: string) => allowedTagIds.has(id));
      if (validTagIds.length > 0) {
        await tx.recipeTag.createMany({
          data: validTagIds.map((tagId: string) => ({ recipeId: recipe.id, tagId })),
        });
      }
    }

    return recipe.id;
  });

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${recipeId}`);
  revalidatePath("/recipes/new");
  return { ok: true, data: { recipeId } };
}
