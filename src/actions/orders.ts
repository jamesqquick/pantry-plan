import { ActionError, defineAction } from "astro:actions";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray } from "drizzle-orm";
import {
  orderCreateSchema,
  orderUpdateSchema,
  orderStatusUpdateSchema,
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

      const id = createId();
      await db.batch([
        db.insert(order).values({
          id,
          userId: user.id,
          name: input.name,
          notes: input.notes?.trim() || null,
          customerName: input.customerName ?? null,
          customerContact: input.customerContact ?? null,
          dueDate: input.dueDate ?? null,
          dueTime: input.dueTime ?? null,
          fulfillmentMethod: input.fulfillmentMethod,
          deliveryAddress: input.deliveryAddress ?? null,
          status: input.status,
        }),
        db.insert(orderItem).values(input.items.map((item) => ({
          orderId: id,
          recipeId: item.recipeId,
          batches: item.batches,
        }))),
      ]);

      return { id };
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

      const patch: Partial<typeof order.$inferInsert> = {
        name: input.name,
        notes: input.notes?.trim() || null,
      };
      if (input.customerName !== undefined) patch.customerName = input.customerName;
      if (input.customerContact !== undefined) patch.customerContact = input.customerContact;
      if (input.dueDate !== undefined) patch.dueDate = input.dueDate;
      if (input.dueTime !== undefined) patch.dueTime = input.dueTime;
      if (input.fulfillmentMethod !== undefined) {
        patch.fulfillmentMethod = input.fulfillmentMethod;
      }
      if (input.deliveryAddress !== undefined) {
        patch.deliveryAddress = input.deliveryAddress;
      }
      if (input.status !== undefined) patch.status = input.status;

      await db.batch([
        db.update(order).set(patch).where(eq(order.id, input.id)),
        db.delete(orderItem).where(eq(orderItem.orderId, input.id)),
        db.insert(orderItem).values(input.items.map((item) => ({
          orderId: input.id,
          recipeId: item.recipeId,
          batches: item.batches,
        }))),
      ]);

      return { id: input.id };
    },
  }),

  /** Update only an order's status from its detail page. */
  updateStatus: defineAction({
    input: orderStatusUpdateSchema,
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

      await db.update(order).set({ status: input.status }).where(eq(order.id, input.id));

      return { id: input.id, status: input.status };
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
