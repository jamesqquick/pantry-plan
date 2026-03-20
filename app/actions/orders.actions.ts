"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getAuthenticatedUser } from "@/app/actions/_shared";
import { zodToFieldErrors } from "@/lib/action-helpers";
import type { ActionResult } from "@/lib/action-helpers";
import {
  orderCreateSchema,
  orderUpdateSchema,
  orderIdSchema,
  orderGroceryCheckToggleSchema,
} from "@/features/orders/orders.schemas";

export async function createOrderAction(
  _prev: unknown,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;
  const user = userResult.data;

  const name = formData.get("name");
  const notes = formData.get("notes");
  const itemsJson = formData.get("items");
  let items: unknown;
  try {
    items = typeof itemsJson === "string" ? JSON.parse(itemsJson) : [];
  } catch {
    items = [];
  }
  const raw = { name: name ?? undefined, notes: notes ?? undefined, items };
  const parsed = orderCreateSchema.safeParse(raw);
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
  const recipeIds = parsed.data.items.map((i) => i.recipeId);
  const recipes = await db.recipe.findMany({
    where: { id: { in: recipeIds }, userId: user.id },
    select: { id: true },
  });
  type RecipeRow = (typeof recipes)[number];
  const foundIds = new Set(recipes.map((r: RecipeRow) => r.id));
  for (const item of parsed.data.items) {
    if (!foundIds.has(item.recipeId)) {
      return { ok: false, error: { code: "FORBIDDEN", message: "One or more recipes not found or not yours." } };
    }
  }

  const order = await db.order.create({
    data: {
      userId: user.id,
      name: parsed.data.name?.trim() || null,
      notes: parsed.data.notes?.trim() || null,
      orderItems: {
        create: parsed.data.items.map((item) => ({
          recipeId: item.recipeId,
          batches: item.batches,
        })),
      },
    },
  });
  revalidatePath("/orders");
  revalidatePath(`/orders/${order.id}`);
  revalidatePath(`/orders/${order.id}/edit`);
  return { ok: true, data: { id: order.id } };
}

export async function updateOrderAction(
  _prev: unknown,
  formData: FormData
): Promise<ActionResult<{ id: string }>> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;
  const user = userResult.data;

  const id = formData.get("id");
  const name = formData.get("name");
  const notes = formData.get("notes");
  const itemsJson = formData.get("items");
  let items: unknown;
  try {
    items = typeof itemsJson === "string" ? JSON.parse(itemsJson) : [];
  } catch {
    items = [];
  }
  const raw = { id, name: name ?? undefined, notes: notes ?? undefined, items };
  const parsed = orderUpdateSchema.safeParse(raw);
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
  const order = await db.order.findFirst({
    where: { id: parsed.data.id, userId: user.id },
    include: { orderItems: true },
  });
  if (!order) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Order not found." } };
  }

  const recipeIds = parsed.data.items.map((i: { recipeId: string }) => i.recipeId);
  const recipes = await db.recipe.findMany({
    where: { id: { in: recipeIds }, userId: user.id },
    select: { id: true },
  });
  type RecipeRow = (typeof recipes)[number];
  const foundIds = new Set(recipes.map((r: RecipeRow) => r.id));
  for (const item of parsed.data.items) {
    if (!foundIds.has(item.recipeId)) {
      return { ok: false, error: { code: "FORBIDDEN", message: "One or more recipes not found or not yours." } };
    }
  }

  await db.orderItem.deleteMany({ where: { orderId: order.id } });
  await db.order.update({
    where: { id: order.id },
    data: {
      name: parsed.data.name?.trim() || null,
      notes: parsed.data.notes?.trim() || null,
      orderItems: {
        create: parsed.data.items.map((item) => ({
          recipeId: item.recipeId,
          batches: item.batches,
        })),
      },
    },
  });
  revalidatePath("/orders");
  revalidatePath(`/orders/${parsed.data.id}`);
  revalidatePath(`/orders/${parsed.data.id}/edit`);
  return { ok: true, data: { id: parsed.data.id } };
}

export async function deleteOrderAction(
  _prev: unknown,
  formData: FormData
): Promise<ActionResult> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;
  const user = userResult.data;

  const parsed = orderIdSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid order id",
        fieldErrors: zodToFieldErrors(parsed.error.issues),
      },
    };
  }

  const db = getDb();
  const order = await db.order.findFirst({
    where: { id: parsed.data.id, userId: user.id },
  });
  if (!order) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Order not found." } };
  }

  await db.order.delete({ where: { id: order.id } });
  revalidatePath("/orders");
  return { ok: true, data: undefined };
}

export async function toggleOrderGroceryItemCheckedAction(
  input: unknown
): Promise<ActionResult<{ checked: boolean }>> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;
  const user = userResult.data;

  const parsed = orderGroceryCheckToggleSchema.safeParse(input);
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

  const { orderId, ingredientId, checked } = parsed.data;
  const db = getDb();

  const order = await db.order.findFirst({
    where: { id: orderId, userId: user.id },
    include: {
      orderItems: {
        include: {
          recipe: {
            select: {
              recipeIngredients: { select: { ingredientId: true } },
            },
          },
        },
      },
    },
  });
  if (!order) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Order not found." } };
  }

  const allowedIngredientIds = new Set<string>();
  for (const oi of order.orderItems) {
    for (const ri of oi.recipe.recipeIngredients) {
      if (ri.ingredientId) allowedIngredientIds.add(ri.ingredientId);
    }
  }
  if (!allowedIngredientIds.has(ingredientId)) {
    return {
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Ingredient is not on this order." },
    };
  }

  try {
    if (checked) {
      await db.orderGroceryCheck.upsert({
        where: {
          orderId_ingredientId: { orderId, ingredientId },
        },
        create: { orderId, ingredientId },
        update: {},
      });
    } else {
      await db.orderGroceryCheck.deleteMany({
        where: { orderId, ingredientId },
      });
    }
  } catch (err) {
    console.error("toggleOrderGroceryItemCheckedAction", err);
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Could not update checklist." },
    };
  }

  revalidatePath(`/orders/${orderId}`);
  return { ok: true, data: { checked } };
}
