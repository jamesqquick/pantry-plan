"use server";

import { revalidatePath, updateTag } from "next/cache";
import { getDb } from "@/lib/db";
import { getAuthenticatedUser, requireAdmin } from "@/app/actions/_shared";
import { zodToFieldErrors } from "@/lib/action-helpers";
import type { ActionResult } from "@/lib/action-helpers";
import {
  ingredientCreateSchema,
  ingredientUpdateSchema,
  ingredientIdSchema,
  ingredientNameSchema,
  ingredientPreferencesSchema,
  ingredientSearchQuerySchema,
} from "@/features/ingredients/ingredients.schemas";
import { normalizeIngredientName } from "@/lib/ingredients/normalize";
import { getCachedIngredientSearch } from "@/lib/queries/ingredients";

export async function createIngredientAction(
  _prev: unknown,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;
  const user = userResult.data;

  const raw = {
    name: formData.get("name"),
    category: formData.get("category") || undefined,
    defaultUnit: formData.get("defaultUnit") || undefined,
    costBasisUnit: formData.get("costBasisUnit") || "GRAM",
    estimatedCentsPerBasisUnit: formData.get("estimatedCentsPerBasisUnit") || undefined,
    notes: formData.get("notes") || undefined,
  };
  const parsed = ingredientCreateSchema.safeParse(raw);
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
  const normalizedName = normalizeIngredientName(parsed.data.name);
  const existing = await db.ingredient.findFirst({
    where: { userId: user.id, normalizedName },
  });
  if (existing) {
    return {
      ok: false,
      error: {
        code: "CONFLICT",
        message: "You already have an ingredient with this name.",
        fieldErrors: { name: ["You already have an ingredient with this name."] },
      },
    };
  }

  const ingredient = await db.ingredient.create({
    data: {
      userId: user.id,
      name: parsed.data.name.trim(),
      normalizedName,
      category: parsed.data.category?.trim() || null,
      defaultUnit: parsed.data.defaultUnit ?? null,
      costBasisUnit: parsed.data.costBasisUnit,
      estimatedCentsPerBasisUnit: parsed.data.estimatedCentsPerBasisUnit ?? null,
      notes: parsed.data.notes?.trim() || null,
    },
  });
  revalidatePath("/ingredients");
  updateTag("ingredients");
  return { ok: true, data: { id: ingredient.id } };
}

export async function updateIngredientAction(
  _prev: unknown,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;
  const user = userResult.data;

  const raw = {
    id: formData.get("id"),
    name: formData.get("name"),
    category: formData.get("category") || undefined,
    defaultUnit: formData.get("defaultUnit") || undefined,
    costBasisUnit: formData.get("costBasisUnit") || undefined,
    estimatedCentsPerBasisUnit: formData.get("estimatedCentsPerBasisUnit") || undefined,
    notes: formData.get("notes") || undefined,
  };
  const parsed = ingredientUpdateSchema.safeParse(raw);
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
  const existing = await db.ingredient.findUnique({
    where: { id: parsed.data.id },
  });
  if (!existing) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Ingredient not found." } };
  }

  if (existing.userId === null) {
    const adminResult = await requireAdmin();
    if (!adminResult.ok) return adminResult;
  } else if (existing.userId !== user.id) {
    return { ok: false, error: { code: "FORBIDDEN", message: "You can only edit your own ingredients." } };
  }

  const normalizedName = normalizeIngredientName(parsed.data.name);
  const duplicate = await db.ingredient.findFirst({
    where: {
      userId: existing.userId,
      normalizedName,
      id: { not: parsed.data.id },
    },
  });
  if (duplicate) {
    return {
      ok: false,
      error: {
        code: "CONFLICT",
        message: "Another ingredient with this name already exists.",
        fieldErrors: { name: ["Another ingredient with this name already exists."] },
      },
    };
  }

  await db.ingredient.update({
    where: { id: parsed.data.id },
    data: {
      name: parsed.data.name.trim(),
      normalizedName,
      category: parsed.data.category?.trim() ?? null,
      defaultUnit: parsed.data.defaultUnit ?? null,
      ...(parsed.data.costBasisUnit != null && { costBasisUnit: parsed.data.costBasisUnit }),
      estimatedCentsPerBasisUnit: parsed.data.estimatedCentsPerBasisUnit ?? null,
      notes: parsed.data.notes?.trim() ?? null,
    },
  });
  revalidatePath("/ingredients");
  revalidatePath(`/ingredients/${parsed.data.id}/edit`);
  updateTag("ingredients");
  return { ok: true, data: { id: parsed.data.id } };
}

export async function deleteIngredientAction(
  _prev: unknown,
  formData: FormData
): Promise<ActionResult> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;
  const user = userResult.data;

  const parsed = ingredientIdSchema.safeParse({ id: formData.get("id") });
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
  const existing = await db.ingredient.findUnique({
    where: { id: parsed.data.id },
    include: { _count: { select: { recipeIngredients: true } } },
  });
  if (!existing) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Ingredient not found." } };
  }

  if (existing.userId === null) {
    const adminResult = await requireAdmin();
    if (!adminResult.ok) return adminResult;
  } else if (existing.userId !== user.id) {
    return { ok: false, error: { code: "FORBIDDEN", message: "You can only delete your own ingredients." } };
  }

  if (existing._count.recipeIngredients > 0) {
    return {
      ok: false,
      error: {
        code: "CONFLICT",
        message: "Cannot delete: this ingredient is used in one or more recipes. Remove it from recipes first.",
      },
    };
  }

  await db.ingredient.delete({ where: { id: parsed.data.id } });
  revalidatePath("/ingredients");
  updateTag("ingredients");
  return { ok: true, data: undefined };
}

export async function upsertFromNameAction(
  _prev: unknown,
  formData: FormData
): Promise<ActionResult<{ id: string; name: string }>> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;
  const user = userResult.data;

  const parsed = ingredientNameSchema.safeParse({ name: formData.get("name") });
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
  const normalizedName = normalizeIngredientName(parsed.data.name);
  let ingredient = await db.ingredient.findFirst({
    where: {
      OR: [{ userId: null, normalizedName }, { userId: user.id, normalizedName }],
    },
  });
  if (!ingredient) {
    ingredient = await db.ingredient.create({
      data: {
        userId: user.id,
        name: parsed.data.name.trim(),
        normalizedName,
        costBasisUnit: "GRAM",
      },
    });
  }
  revalidatePath("/ingredients");
  updateTag("ingredients");
  return { ok: true, data: { id: ingredient.id, name: ingredient.name } };
}

export async function updateIngredientPreferencesAction(
  _prev: unknown,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;
  const user = userResult.data;

  const parsed = ingredientPreferencesSchema.safeParse({
    ingredientId: formData.get("ingredientId"),
    preferredDisplayUnit: formData.get("preferredDisplayUnit"),
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

  const db = getDb();
  const existing = await db.ingredient.findUnique({
    where: { id: parsed.data.ingredientId },
  });
  if (!existing) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Ingredient not found." } };
  }

  if (existing.userId === null) {
    const adminResult = await requireAdmin();
    if (!adminResult.ok) return adminResult;
  } else if (existing.userId !== user.id) {
    return { ok: false, error: { code: "FORBIDDEN", message: "You can only edit your own ingredients." } };
  }

  await db.ingredient.update({
    where: { id: parsed.data.ingredientId },
    data: { preferredDisplayUnit: parsed.data.preferredDisplayUnit },
  });
  revalidatePath("/ingredients");
  revalidatePath(`/ingredients/${parsed.data.ingredientId}/edit`);
  revalidatePath("/orders");
  updateTag("ingredients");
  return { ok: true, data: { id: parsed.data.ingredientId } };
}

export type PickerIngredient = { id: string; name: string; source: "global" | "custom" };

export async function searchIngredientsForPickerAction(
  raw: unknown
): Promise<ActionResult<PickerIngredient[]>> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;
  const user = userResult.data;

  const parsed = ingredientSearchQuerySchema.safeParse(raw);
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

  const query = parsed.data;
  if (query.length === 0) {
    return { ok: true, data: [] };
  }

  const data = await getCachedIngredientSearch(user.id, query);
  return { ok: true, data };
}
