"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getAuthenticatedUser } from "@/app/actions/_shared";
import { zodToFieldErrors } from "@/lib/action-helpers";
import type { ActionResult } from "@/lib/action-helpers";
import {
  upsertPlannedMealSchema,
  updatePlannedMealSchema,
  plannedMealIdSchema,
  movePlannedMealSchema,
} from "@/features/meal-plan/meal-plan.schemas";
import { parseDateString } from "@/lib/meal-plan/week-dates";

export async function upsertPlannedMealAction(
  _prev: unknown,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;
  const user = userResult.data;

  const raw = {
    date: formData.get("date"),
    mealSlot: formData.get("mealSlot"),
    recipeId: formData.get("recipeId") || undefined,
    customLabel: (formData.get("customLabel") as string)?.trim() || undefined,
    servings: formData.get("servings"),
  };
  const parsed = upsertPlannedMealSchema.safeParse(raw);
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

  const date = parseDateString(parsed.data.date);
  const db = getDb();

  if (parsed.data.recipeId) {
    const recipe = await db.recipe.findFirst({
      where: { id: parsed.data.recipeId, userId: user.id },
      select: { id: true },
    });
    if (!recipe) {
      return { ok: false, error: { code: "FORBIDDEN", message: "Recipe not found." } };
    }
  }

  const existing = await db.plannedMeal.findUnique({
    where: {
      userId_date_mealSlot: {
        userId: user.id,
        date,
        mealSlot: parsed.data.mealSlot,
      },
    },
  });

  if (existing) {
    await db.plannedMeal.update({
      where: { id: existing.id },
      data: {
        recipeId: parsed.data.recipeId ?? null,
        customLabel: parsed.data.customLabel ?? null,
        servings: parsed.data.servings ?? null,
      },
    });
    revalidatePath("/meal-plan");
    revalidatePath("/meal-plan/[weekStart]", "page");
    return { ok: true, data: { id: existing.id } };
  }

  const created = await db.plannedMeal.create({
    data: {
      userId: user.id,
      date,
      mealSlot: parsed.data.mealSlot,
      recipeId: parsed.data.recipeId ?? null,
      customLabel: parsed.data.customLabel ?? null,
      servings: parsed.data.servings ?? null,
    },
  });
  revalidatePath("/meal-plan");
  revalidatePath("/meal-plan/[weekStart]", "page");
  return { ok: true, data: { id: created.id } };
}

export async function updatePlannedMealAction(
  _prev: unknown,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;
  const user = userResult.data;

  const raw: Record<string, unknown> = {
    id: formData.get("id"),
    date: formData.get("date") || undefined,
    mealSlot: formData.get("mealSlot") || undefined,
    recipeId: formData.get("recipeId") ?? undefined,
    customLabel: formData.get("customLabel") ?? undefined,
    servings: formData.get("servings") ?? undefined,
  };
  if (raw.recipeId === "") raw.recipeId = null;
  if (raw.customLabel === "") raw.customLabel = null;
  if (raw.servings === "") raw.servings = null;
  const parsed = updatePlannedMealSchema.safeParse(raw);
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
  const existing = await db.plannedMeal.findFirst({
    where: { id: parsed.data.id, userId: user.id },
  });
  if (!existing) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Planned meal not found." } };
  }

  const update: Parameters<typeof db.plannedMeal.update>[0]["data"] = {};
  if (parsed.data.date != null) update.date = parseDateString(parsed.data.date);
  if (parsed.data.mealSlot != null) update.mealSlot = parsed.data.mealSlot;
  if (parsed.data.recipeId !== undefined) update.recipeId = parsed.data.recipeId;
  if (parsed.data.customLabel !== undefined) update.customLabel = parsed.data.customLabel;
  if (parsed.data.servings !== undefined) update.servings = parsed.data.servings;

  await db.plannedMeal.update({ where: { id: existing.id }, data: update });
  revalidatePath("/meal-plan");
  revalidatePath("/meal-plan/[weekStart]", "page");
  return { ok: true, data: { id: existing.id } };
}

export async function deletePlannedMealAction(
  _prev: unknown,
  formData: FormData
): Promise<ActionResult> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;
  const user = userResult.data;

  const parsed = plannedMealIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid planned meal id",
        fieldErrors: zodToFieldErrors(parsed.error.issues),
      },
    };
  }

  const db = getDb();
  const existing = await db.plannedMeal.findFirst({
    where: { id: parsed.data.id, userId: user.id },
  });
  if (!existing) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Planned meal not found." } };
  }

  await db.plannedMeal.delete({ where: { id: existing.id } });
  revalidatePath("/meal-plan");
  revalidatePath("/meal-plan/[weekStart]", "page");
  return { ok: true, data: undefined };
}

export async function movePlannedMealAction(
  _prev: unknown,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;
  const user = userResult.data;

  const parsed = movePlannedMealSchema.safeParse({
    id: formData.get("id"),
    date: formData.get("date"),
    mealSlot: formData.get("mealSlot"),
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
  const existing = await db.plannedMeal.findFirst({
    where: { id: parsed.data.id, userId: user.id },
  });
  if (!existing) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Planned meal not found." } };
  }

  const newDate = parseDateString(parsed.data.date);
  const conflict = await db.plannedMeal.findUnique({
    where: {
      userId_date_mealSlot: {
        userId: user.id,
        date: newDate,
        mealSlot: parsed.data.mealSlot,
      },
    },
  });
  if (conflict && conflict.id !== existing.id) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "That slot already has a meal. Remove it or choose another slot.",
      },
    };
  }

  await db.plannedMeal.update({
    where: { id: existing.id },
    data: { date: newDate, mealSlot: parsed.data.mealSlot },
  });
  revalidatePath("/meal-plan");
  revalidatePath("/meal-plan/[weekStart]", "page");
  return { ok: true, data: { id: existing.id } };
}
