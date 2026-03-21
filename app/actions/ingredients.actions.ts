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
  globalIngredientByIdSchema,
} from "@/features/ingredients/ingredients.schemas";
import { normalizeIngredientName } from "@/lib/ingredients/normalize";
import {
  getCachedIngredientSearch,
  listGlobalIngredientsForBaseSearch,
} from "@/lib/queries/ingredients";
import type { CostBasisUnit, IngredientUnit } from "@/generated/prisma/client";

export type GlobalIngredientBasePrefillData = {
  category: string | null;
  subcategory: string;
  defaultUnit: IngredientUnit | null;
  costBasisUnit: CostBasisUnit;
  estimatedCentsPerBasisUnit: number | null;
  notes: string | null;
};

async function resolveCategoryFromCatalog(
  raw: string | undefined | null,
): Promise<
  | { ok: true; value: string | null }
  | { ok: false; fieldErrors: { category: string[] } }
> {
  const db = getDb();
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t) return { ok: true, value: null };
  const row = await db.ingredientCategory.findFirst({ where: { name: t } });
  if (!row) {
    return {
      ok: false,
      fieldErrors: { category: ["Select a valid category from the list."] },
    };
  }
  return { ok: true, value: row.name };
}

export async function createIngredientAction(
  _prev: unknown,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;
  const user = userResult.data;

  const baseRaw = formData.get("baseIngredientId");
  const baseIngredientId =
    typeof baseRaw === "string" && baseRaw.trim().length > 0 ? baseRaw.trim() : undefined;

  const estRaw = formData.get("estimatedCentsPerBasisUnit");
  const raw = {
    name: formData.get("name"),
    category: formData.get("category") || undefined,
    subcategory: formData.get("subcategory") || undefined,
    defaultUnit: formData.get("defaultUnit") || undefined,
    costBasisUnit: formData.get("costBasisUnit") || "GRAM",
    estimatedCentsPerBasisUnit:
      estRaw == null || String(estRaw).trim() === "" ? undefined : estRaw,
    notes: formData.get("notes") || undefined,
    baseIngredientId,
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

  const categoryResolved = await resolveCategoryFromCatalog(parsed.data.category);
  if (!categoryResolved.ok) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        fieldErrors: categoryResolved.fieldErrors,
      },
    };
  }

  const db = getDb();

  if (parsed.data.baseIngredientId) {
    const base = await db.ingredient.findFirst({
      where: { id: parsed.data.baseIngredientId, userId: null },
      select: { id: true },
    });
    if (!base) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid base ingredient.",
          fieldErrors: { baseIngredientId: ["Select a valid global ingredient."] },
        },
      };
    }
  }

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
      category: categoryResolved.value,
      subcategory: parsed.data.subcategory?.trim() ?? "",
      defaultUnit: parsed.data.defaultUnit ?? null,
      costBasisUnit: parsed.data.costBasisUnit,
      estimatedCentsPerBasisUnit: parsed.data.estimatedCentsPerBasisUnit ?? null,
      notes: parsed.data.notes?.trim() || null,
      baseIngredientId: parsed.data.baseIngredientId ?? null,
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

  const estUpdateRaw = formData.get("estimatedCentsPerBasisUnit");
  const raw = {
    id: formData.get("id"),
    name: formData.get("name"),
    category: formData.get("category") || undefined,
    subcategory: formData.get("subcategory") || undefined,
    defaultUnit: formData.get("defaultUnit") || undefined,
    costBasisUnit: formData.get("costBasisUnit") || undefined,
    estimatedCentsPerBasisUnit:
      estUpdateRaw == null || String(estUpdateRaw).trim() === "" ? undefined : estUpdateRaw,
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

  const categoryResolved = await resolveCategoryFromCatalog(parsed.data.category);
  if (!categoryResolved.ok) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        fieldErrors: categoryResolved.fieldErrors,
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
      category: categoryResolved.value,
      subcategory: parsed.data.subcategory?.trim() ?? "",
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

/** Search global catalog ingredients only (for "create custom from global base"). */
export async function searchGlobalIngredientsForBaseAction(
  raw: unknown
): Promise<ActionResult<PickerIngredient[]>> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;

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

  const rows = await listGlobalIngredientsForBaseSearch(query);
  return {
    ok: true,
    data: rows.map((r) => ({
      id: r.id,
      name: r.name,
      source: "global" as const,
    })),
  };
}

/** Load field values from a global ingredient to prefill the create form. */
export async function getGlobalIngredientBasePrefillAction(
  raw: unknown
): Promise<ActionResult<GlobalIngredientBasePrefillData>> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;

  const parsed = globalIngredientByIdSchema.safeParse(raw);
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
  const base = await db.ingredient.findFirst({
    where: { id: parsed.data.id, userId: null },
    select: {
      category: true,
      subcategory: true,
      defaultUnit: true,
      costBasisUnit: true,
      estimatedCentsPerBasisUnit: true,
      notes: true,
    },
  });

  if (!base) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "Global ingredient not found." },
    };
  }

  return {
    ok: true,
    data: {
      category: base.category,
      subcategory: base.subcategory ?? "",
      defaultUnit: base.defaultUnit,
      costBasisUnit: base.costBasisUnit,
      estimatedCentsPerBasisUnit: base.estimatedCentsPerBasisUnit,
      notes: base.notes,
    },
  };
}
