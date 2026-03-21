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
  weekStartSchema,
} from "@/features/meal-plan/meal-plan.schemas";
import { parseDateString, getWeekDates } from "@/lib/meal-plan/week-dates";
import { getPlannedMealsForWeek } from "@/lib/queries/meal-plan";
import { listRecipesForUser } from "@/lib/queries/recipes";
import { getGroceryListFromPlan } from "@/lib/meal-plan/grocery-from-plan";
import {
  toDisplayUnits,
  type CanonicalUnit,
  type CanonicalUnitLabel,
} from "@/lib/grocery/display-units";
import type { GroceryLine } from "@/lib/grocery/format";
import { costBasisToCanonicalDisplay } from "@/lib/grocery/cost-basis-units";
import type { CostBasisUnit } from "@/generated/prisma/client";

export async function upsertPlannedMealAction(
  _prev: unknown,
  formData: FormData,
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
      return {
        ok: false,
        error: { code: "FORBIDDEN", message: "Recipe not found." },
      };
    }
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
  formData: FormData,
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
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "Planned meal not found." },
    };
  }

  const update: Parameters<typeof db.plannedMeal.update>[0]["data"] = {};
  if (parsed.data.date != null) update.date = parseDateString(parsed.data.date);
  if (parsed.data.mealSlot != null) update.mealSlot = parsed.data.mealSlot;
  if (parsed.data.recipeId !== undefined)
    update.recipeId = parsed.data.recipeId;
  if (parsed.data.customLabel !== undefined)
    update.customLabel = parsed.data.customLabel;
  if (parsed.data.servings !== undefined)
    update.servings = parsed.data.servings;

  await db.plannedMeal.update({ where: { id: existing.id }, data: update });
  revalidatePath("/meal-plan");
  revalidatePath("/meal-plan/[weekStart]", "page");
  return { ok: true, data: { id: existing.id } };
}

export async function deletePlannedMealAction(
  _prev: unknown,
  formData: FormData,
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
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "Planned meal not found." },
    };
  }

  await db.plannedMeal.delete({ where: { id: existing.id } });
  revalidatePath("/meal-plan");
  revalidatePath("/meal-plan/[weekStart]", "page");
  return { ok: true, data: undefined };
}

export async function movePlannedMealAction(
  _prev: unknown,
  formData: FormData,
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
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "Planned meal not found." },
    };
  }

  const newDate = parseDateString(parsed.data.date);

  await db.plannedMeal.update({
    where: { id: existing.id },
    data: { date: newDate, mealSlot: parsed.data.mealSlot },
  });
  revalidatePath("/meal-plan");
  revalidatePath("/meal-plan/[weekStart]", "page");
  return { ok: true, data: { id: existing.id } };
}

export type MealPlanWeekData = {
  weekStart: string;
  weekDates: string[];
  plannedMeals: Array<{
    id: string;
    date: string;
    mealSlot: string;
    recipeId: string | null;
    customLabel: string | null;
    servings: number | null;
    recipe: { id: string; title: string } | null;
  }>;
  recipeOptions: Array<{ id: string; title: string }>;
  groceryTotals: Array<{
    ingredientId: string;
    name: string;
    basisUnit: string;
    basisUnitLabel: CanonicalUnitLabel;
    totalBasisQty: number;
    estimatedCostCents: number | null;
    anyOptional: boolean;
    preferredDisplayUnit: string;
    gramsPerCup: number | null;
    sources?: Array<{
      recipeId: string;
      recipeTitle: string;
      qty: number;
      unit: string | null;
      batches: number;
      basisQty: number | null;
    }>;
  }>;
  groceryLines: GroceryLine[];
  groceryIssues: {
    unmapped: Array<{ recipeId: string; recipeTitle: string; displayText: string }>;
    missingQuantityOrUnit: Array<{ recipeId: string; recipeTitle: string; displayText: string }>;
    cannotConvert: Array<{
      recipeId: string;
      recipeTitle: string;
      ingredientName?: string;
      displayText: string;
      quantity: number | null;
      unit: string | null;
      basisUnit: string;
      reason: string;
    }>;
    missingCost: Array<{ ingredientId: string; name: string }>;
  } | null;
  totalEstimatedCostCents: number;
};

export async function getMealPlanWeekDataAction(
  weekStart: string,
): Promise<ActionResult<MealPlanWeekData>> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;
  const user = userResult.data;

  const parsed = weekStartSchema.safeParse(weekStart);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid week",
        fieldErrors: zodToFieldErrors(parsed.error.issues),
      },
    };
  }

  const [plannedMeals, recipeOptions, grocery] = await Promise.all([
    getPlannedMealsForWeek(user.id, parsed.data),
    listRecipesForUser(user.id),
    getGroceryListFromPlan({ userId: user.id, weekStart: parsed.data }),
  ]);

  const weekDates = getWeekDates(parsed.data);
  const plannedMealsSerialized = plannedMeals.map((p) => ({
    id: p.id,
    date:
      p.date instanceof Date
        ? p.date.toISOString().slice(0, 10)
        : String(p.date).slice(0, 10),
    mealSlot: p.mealSlot,
    recipeId: p.recipeId,
    customLabel: p.customLabel,
    servings: p.servings,
    recipe: p.recipe,
  }));

  const groceryTotals =
    grocery?.totals.map((t) => ({
      ingredientId: t.ingredientId,
      name: t.name,
      basisUnit: t.basisUnit,
      basisUnitLabel: t.basisUnitLabel,
      totalBasisQty: t.totalBasisQty,
      estimatedCostCents: t.estimatedCostCents,
      anyOptional: t.anyOptional,
      preferredDisplayUnit: t.preferredDisplayUnit,
      gramsPerCup: t.gramsPerCup != null ? Number(t.gramsPerCup) : null,
      sources: t.sources.map((s) => ({
        recipeId: s.recipeId,
        recipeTitle: s.recipeTitle,
        qty: s.qty,
        unit: s.unit,
        batches: s.batches,
        basisQty: s.basisQty,
      })),
    })) ?? [];

  const groceryLines: GroceryLine[] = grocery
    ? grocery.totals.map((t) => {
        const canonicalUnit: CanonicalUnit = costBasisToCanonicalDisplay(
          t.basisUnit as CostBasisUnit,
        );
        const display = toDisplayUnits({
          canonicalQty: t.totalBasisQty,
          canonicalUnit,
          ingredient: {
            preferredDisplayUnit:
              t.preferredDisplayUnit as import("@/lib/grocery/display-units").DisplayPreference,
            gramsPerCup: t.gramsPerCup,
          },
        });
        return {
          name: t.name,
          totalText: display.displayText,
          optional: t.anyOptional,
        };
      })
    : [];

  return {
    ok: true,
    data: {
      weekStart: parsed.data,
      weekDates,
      plannedMeals: plannedMealsSerialized,
      recipeOptions,
      groceryTotals,
      groceryLines,
      groceryIssues: grocery?.issues ?? null,
      totalEstimatedCostCents: grocery?.totalEstimatedCostCents ?? 0,
    },
  };
}
