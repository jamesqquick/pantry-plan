"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { IngredientUnit } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { getAuthenticatedUser } from "@/app/actions/_shared";
import { zodToFieldErrors } from "@/lib/action-helpers";
import type { ActionResult } from "@/lib/action-helpers";
import {
  recipeCreateSchema,
  recipeUpdateSchema,
  recipeIdSchema,
  duplicateRecipeSchema,
} from "@/features/recipes/recipes.schemas";
import { setRecipeIngredientsSchema } from "@/features/recipes/recipe-ingredients.schemas";
import { getRecipeWithEffectiveIngredientsForUser } from "@/lib/queries/recipes";

export async function createRecipeAction(
  _prev: unknown,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;
  const user = userResult.data;
  const db = getDb();

  const raw: Record<string, unknown> = {};
  formData.forEach((v, k) => {
    if (k === "ingredientsStructured") return;
    if (k === "ingredients" || k === "instructions" || k === "tagIds") {
      if (!raw[k]) raw[k] = [];
      (raw[k] as string[]).push(v as string);
    } else {
      raw[k] = v;
    }
  });
  const parsed = recipeCreateSchema.safeParse(raw);
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
  const recipe = await db.recipe.create({
    data: {
      userId: user.id,
      title: parsed.data.title,
      sourceUrl: parsed.data.sourceUrl || null,
      imageUrl: parsed.data.imageUrl || null,
      servings: parsed.data.servings ?? null,
      prepTimeMinutes: parsed.data.prepTimeMinutes ?? null,
      cookTimeMinutes: parsed.data.cookTimeMinutes ?? null,
      totalTimeMinutes: parsed.data.totalTimeMinutes ?? null,
      notes: parsed.data.notes ?? null,
    },
  });
  if (parsed.data.instructions.length > 0) {
    await db.recipeInstruction.createMany({
      data: parsed.data.instructions.map((text, sortOrder) => ({
        recipeId: recipe.id,
        sortOrder,
        text: text.trim() || "—",
      })),
    });
  }
  const ingredientsStructuredRaw = formData.get("ingredientsStructured");
  if (typeof ingredientsStructuredRaw === "string" && ingredientsStructuredRaw.trim()) {
    let items: unknown;
    try {
      items = JSON.parse(ingredientsStructuredRaw);
    } catch {
      items = [];
    }
    const structuredParsed = setRecipeIngredientsSchema.safeParse({
      recipeId: recipe.id,
      items: Array.isArray(items) ? items : [],
    });
    if (structuredParsed.success && structuredParsed.data.items.length > 0) {
      await db.recipeIngredient.createMany({
        data: structuredParsed.data.items.map((item) => {
          const displayText = (item as { displayText?: string }).displayText?.trim() || "—";
          const ingredientId = item.ingredientId?.trim() || null;
          return {
            recipeId: recipe.id,
            ingredientId,
            quantity: item.quantity ?? null,
            unit: item.unit ?? null,
            displayText,
            rawText: (item as { rawText?: string | null }).rawText?.trim() || null,
            sortOrder: item.sortOrder,
          };
        }),
      });
    }
  }
  if (parsed.data.tagIds.length > 0) {
    const userTagIds = await db.tag.findMany({
      where: { userId: user.id },
      select: { id: true },
    });
    const allowedIds = new Set(userTagIds.map((t) => t.id));
    const validTagIds = parsed.data.tagIds.filter((id) => allowedIds.has(id));
    if (validTagIds.length > 0) {
      await db.recipeTag.createMany({
        data: validTagIds.map((tagId) => ({ recipeId: recipe.id, tagId })),
      });
    }
  }
  revalidatePath("/recipes");
  revalidatePath("/");
  return { ok: true, data: { id: recipe.id } };
}

export async function updateRecipeAction(
  _prev: unknown,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;
  const user = userResult.data;

  const raw: Record<string, unknown> = { id: formData.get("id") };
  formData.forEach((v, k) => {
    if (k === "id" || k === "ingredientsStructured") return;
    if (k === "ingredients" || k === "instructions" || k === "tagIds") {
      if (!raw[k]) raw[k] = [];
      (raw[k] as string[]).push(v as string);
    } else {
      raw[k] = v;
    }
  });
  const parsed = recipeUpdateSchema.safeParse(raw);
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
  const db = getDb();
  const existing = await db.recipe.findUnique({ where: { id: parsed.data.id } });
  if (!existing || existing.userId !== user.id) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Recipe not found." } };
  }
  const update: Parameters<typeof db.recipe.update>[0]["data"] = {};
  if (parsed.data.title !== undefined) update.title = parsed.data.title;
  if (parsed.data.sourceUrl !== undefined) update.sourceUrl = parsed.data.sourceUrl || null;
  if (parsed.data.imageUrl !== undefined) update.imageUrl = parsed.data.imageUrl || null;
  if (parsed.data.servings !== undefined) update.servings = parsed.data.servings ?? null;
  if (parsed.data.prepTimeMinutes !== undefined) update.prepTimeMinutes = parsed.data.prepTimeMinutes ?? null;
  if (parsed.data.cookTimeMinutes !== undefined) update.cookTimeMinutes = parsed.data.cookTimeMinutes ?? null;
  if (parsed.data.totalTimeMinutes !== undefined) update.totalTimeMinutes = parsed.data.totalTimeMinutes ?? null;
  if (parsed.data.notes !== undefined) update.notes = parsed.data.notes ?? null;

  await db.recipe.update({ where: { id: parsed.data.id }, data: update });

  const instructionsToSave = parsed.data.instructions;
  if (instructionsToSave !== undefined) {
    await db.$transaction(async (tx) => {
      await tx.recipeInstruction.deleteMany({ where: { recipeId: parsed.data.id } });
      if (instructionsToSave.length > 0) {
        await tx.recipeInstruction.createMany({
          data: instructionsToSave.map((text, sortOrder) => ({
            recipeId: parsed.data.id,
            sortOrder,
            text: text.trim() || "—",
          })),
        });
      }
    });
  }

  const ingredientsStructuredRaw = formData.get("ingredientsStructured");
  if (typeof ingredientsStructuredRaw === "string" && ingredientsStructuredRaw.trim()) {
    let items: unknown;
    try {
      items = JSON.parse(ingredientsStructuredRaw);
    } catch {
      items = [];
    }
    const structuredParsed = setRecipeIngredientsSchema.safeParse({
      recipeId: parsed.data.id,
      items: Array.isArray(items) ? items : [],
    });
    if (structuredParsed.success && structuredParsed.data.items.length > 0) {
      await db.$transaction(async (tx) => {
        await tx.recipeIngredient.deleteMany({
          where: { recipeId: parsed.data.id },
        });
        await tx.recipeIngredient.createMany({
          data: structuredParsed.data.items.map((item) => {
            const displayText = (item as { displayText?: string }).displayText?.trim() || "—";
            const ingredientId = item.ingredientId?.trim() || null;
            return {
              recipeId: parsed.data.id,
              ingredientId,
              quantity: item.quantity ?? null,
              unit: item.unit ?? null,
              displayText,
              rawText: (item as { rawText?: string | null }).rawText?.trim() || null,
              sortOrder: item.sortOrder,
            };
          }),
        });
      });
    }
  }

  if (parsed.data.tagIds !== undefined) {
    const userTagIds = await db.tag.findMany({
      where: { userId: user.id },
      select: { id: true },
    });
    const allowedIds = new Set(userTagIds.map((t) => t.id));
    const validTagIds = parsed.data.tagIds.filter((id) => allowedIds.has(id));
    await db.$transaction(async (tx) => {
      await tx.recipeTag.deleteMany({ where: { recipeId: parsed.data.id } });
      if (validTagIds.length > 0) {
        await tx.recipeTag.createMany({
          data: validTagIds.map((tagId) => ({ recipeId: parsed.data.id, tagId })),
        });
      }
    });
  }

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${parsed.data.id}`);
  revalidatePath(`/recipes/${parsed.data.id}/edit`, "page");
  revalidatePath("/");
  return { ok: true, data: { id: parsed.data.id } };
}

export async function deleteRecipeAction(
  _prev: unknown,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;
  const user = userResult.data;

  const parsed = recipeIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid recipe id",
        fieldErrors: zodToFieldErrors(parsed.error.issues),
      },
    };
  }
  const db = getDb();
  const existing = await db.recipe.findUnique({ where: { id: parsed.data.id } });
  if (!existing || existing.userId !== user.id) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Recipe not found." } };
  }
  await db.recipe.delete({ where: { id: parsed.data.id } });
  revalidatePath("/recipes");
  revalidatePath("/");
  const noRedirect = formData.get("noredirect") === "1";
  if (noRedirect) return { ok: true, data: { id: parsed.data.id } };
  redirect("/recipes");
}

export async function duplicateRecipeAction(
  _prev: unknown,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;
  const user = userResult.data;

  const parsed = duplicateRecipeSchema.safeParse({
    recipeId: formData.get("recipeId"),
  });
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

  const source = await getRecipeWithEffectiveIngredientsForUser(
    parsed.data.recipeId,
    user.id
  );
  if (!source) {
    return { ok: false, error: { code: "NOT_FOUND", message: "Recipe not found." } };
  }

  const db = getDb();
  const newTitle = `Copy of ${source.title}`;
  const copy = await db.recipe.create({
    data: {
      userId: user.id,
      title: newTitle,
      sourceUrl: source.sourceUrl,
      imageUrl: source.imageUrl,
      servings: source.servings,
      prepTimeMinutes: source.prepTimeMinutes,
      cookTimeMinutes: source.cookTimeMinutes,
      totalTimeMinutes: source.totalTimeMinutes,
      notes: source.notes,
    },
  });

  const instructions = source.recipeInstructions ?? [];
  if (instructions.length > 0) {
    await db.recipeInstruction.createMany({
      data: instructions.map((inst) => ({
        recipeId: copy.id,
        sortOrder: inst.sortOrder,
        text: inst.text,
      })),
    });
  }

  const effective = source.effectiveIngredients ?? [];
  if (effective.length > 0) {
    await db.recipeIngredient.createMany({
      data: effective.map((ei, index) => ({
        recipeId: copy.id,
        ingredientId: ei.ingredientId,
        quantity: ei.quantity,
        unit: (ei.unit as IngredientUnit | null) ?? undefined,
        displayText: ei.displayText,
        sortOrder: ei.sortOrder ?? index,
      })),
    });
  }

  const sourceRecipeTags = await db.recipeTag.findMany({
    where: { recipeId: parsed.data.recipeId },
    select: { tagId: true },
  });
  if (sourceRecipeTags.length > 0) {
    const userTagIds = await db.tag.findMany({
      where: { userId: user.id },
      select: { id: true },
    });
    const allowedIds = new Set(userTagIds.map((t) => t.id));
    const validTagIds = sourceRecipeTags
      .map((rt) => rt.tagId)
      .filter((id) => allowedIds.has(id));
    if (validTagIds.length > 0) {
      await db.recipeTag.createMany({
        data: validTagIds.map((tagId) => ({ recipeId: copy.id, tagId })),
      });
    }
  }

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${copy.id}`);
  revalidatePath("/");
  return { ok: true, data: { id: copy.id } };
}
