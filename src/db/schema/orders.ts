import {
  index,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { cuidPk, createdAt, updatedAt } from "./_shared";
import { user } from "./users";
import { recipe } from "./recipes";
import type { OrderFulfillmentMethod, OrderStatus } from "./enums";

export const order = sqliteTable(
  "Order",
  {
    id: cuidPk(),
    userId: text("userId")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name"),
    notes: text("notes"),
    customerName: text("customerName"),
    customerContact: text("customerContact"),
    dueDate: text("dueDate"),
    dueTime: text("dueTime"),
    fulfillmentMethod: text("fulfillmentMethod")
      .notNull()
      .default("PICKUP")
      .$type<OrderFulfillmentMethod>(),
    deliveryAddress: text("deliveryAddress"),
    status: text("status").notNull().default("DRAFT").$type<OrderStatus>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("Order_userId_updatedAt_idx").on(t.userId, t.updatedAt)]
);

export const orderItem = sqliteTable(
  "OrderItem",
  {
    id: cuidPk(),
    orderId: text("orderId")
      .notNull()
      .references(() => order.id, { onDelete: "cascade" }),
    recipeId: text("recipeId")
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    /** Float batches; business rule (>= 0.5) enforced in app layer (Zod). */
    batches: real("batches").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("OrderItem_orderId_recipeId_key").on(t.orderId, t.recipeId),
    index("OrderItem_orderId_idx").on(t.orderId),
  ]
);

export type Order = typeof order.$inferSelect;
export type OrderItem = typeof orderItem.$inferSelect;
