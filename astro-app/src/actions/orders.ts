import { ActionError, defineAction } from "astro:actions";
import { and, eq, inArray } from "drizzle-orm";
import {
  orderCreateSchema,
  orderUpdateSchema,
  orderIdSchema,
} from "@/features/orders/orders.schemas";
import { order, orderItem, recipe } from "@/db";
import { getDb, requireUser } from "./_shared";

/**
 * Ensure every recipeId in `items` belongs to the given user. Throws
 * FORBIDDEN if any foreign recipe id slipped through the input.
 */
async function ensureAllRecipesOwned(
  db: ReturnType<typeof getDb>,
  userId: string,
  recipeIds: readonly string[]
): Promise<void> {
  if (recipeIds.length === 0) return;
  const rows = await db
    .select({ id: recipe.id })
    .from(recipe)
    .where(and(eq(recipe.userId, userId), inArray(recipe.id, [...recipeIds])));
  if (rows.length !== new Set(recipeIds).size) {
    throw new ActionError({
      code: "FORBIDDEN",
      message: "One or more recipes not found or not yours.",
    });
  }
}

export const orders = {
  /** Create an order with its initial set of recipe × batchCount items. */
  create: defineAction({
    input: orderCreateSchema,
    handler: async (input, ctx) => {
      const user = requireUser(ctx);
      const db = getDb();

      await ensureAllRecipesOwned(
        db,
        user.id,
        input.items.map((i) => i.recipeId)
      );

      const [row] = await db
        .insert(order)
        .values({
          userId: user.id,
          name: input.name?.trim() || null,
          notes: input.notes?.trim() || null,
        })
        .returning({ id: order.id });
      if (!row) {
        throw new ActionError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create order",
        });
      }

      await db.insert(orderItem).values(
        input.items.map((item) => ({
          orderId: row.id,
          recipeId: item.recipeId,
          batches: item.batches,
        }))
      );

      return { id: row.id };
    },
  }),

  /** Update order meta + replace items in full. */
  update: defineAction({
    input: orderUpdateSchema,
    handler: async (input, ctx) => {
      const user = requireUser(ctx);
      const db = getDb();

      const existing = await db
        .select({ id: order.id })
        .from(order)
        .where(and(eq(order.id, input.id), eq(order.userId, user.id)))
        .limit(1);
      if (existing.length === 0) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Order not found.",
        });
      }

      await ensureAllRecipesOwned(
        db,
        user.id,
        input.items.map((i) => i.recipeId)
      );

      await db
        .update(order)
        .set({
          name: input.name?.trim() || null,
          notes: input.notes?.trim() || null,
        })
        .where(eq(order.id, input.id));

      await db.delete(orderItem).where(eq(orderItem.orderId, input.id));
      await db.insert(orderItem).values(
        input.items.map((item) => ({
          orderId: input.id,
          recipeId: item.recipeId,
          batches: item.batches,
        }))
      );

      return { id: input.id };
    },
  }),

  /** Delete an order (FK cascade removes its items). */
  delete: defineAction({
    accept: "form",
    input: orderIdSchema,
    handler: async (input, ctx) => {
      const user = requireUser(ctx);
      const db = getDb();

      const existing = await db
        .select({ id: order.id })
        .from(order)
        .where(and(eq(order.id, input.id), eq(order.userId, user.id)))
        .limit(1);
      if (existing.length === 0) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Order not found.",
        });
      }

      await db.delete(order).where(eq(order.id, input.id));
      return { id: input.id };
    },
  }),
};
