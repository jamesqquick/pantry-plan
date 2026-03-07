"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { getDb } from "@/lib/db";
import { getAuthenticatedUser } from "@/app/actions/_shared";
import { zodToFieldErrors } from "@/lib/action-helpers";
import type { ActionResult } from "@/lib/action-helpers";
import { setRecipeIngredientsSchema } from "@/features/recipes/recipe-ingredients.schemas";

export async function setRecipeIngredientsAction(
  _prev: unknown,
  formData: FormData
): Promise<ActionResult> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;
  const user = userResult.data;

  const recipeId = formData.get("recipeId");
  const itemsJson = formData.get("items");
  let items: unknown;
  try {
    items = typeof itemsJson === "string" ? JSON.parse(itemsJson) : [];
  } catch {
    items = [];
  }
  const parsed = setRecipeIngredientsSchema.safeParse({ recipeId, items });
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
  const recipe = await db.recipe.findFirst({
    where: { id: parsed.data.recipeId, userId: user.id },
  });
  if (!recipe) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Recipe not found." } };
  }

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.recipeIngredient.deleteMany({
      where: { recipeId: parsed.data.recipeId },
    });
    if (parsed.data.items.length === 0) return;
    await tx.recipeIngredient.createMany({
      data: parsed.data.items.map((item) => ({
        recipeId: parsed.data.recipeId,
        ingredientId: item.ingredientId?.trim() || null,
        quantity: item.quantity ?? null,
        unit: item.unit ?? null,
        displayText: item.displayText?.trim() || "—",
        rawText: item.rawText?.trim() || null,
        sortOrder: item.sortOrder,
      })),
    });
  });

  revalidatePath(`/recipes/${parsed.data.recipeId}`);
  revalidatePath(`/recipes/${parsed.data.recipeId}/edit`, "page");
  return { ok: true, data: undefined };
}
