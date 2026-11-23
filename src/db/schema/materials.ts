import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { cuidPk, createdAt, updatedAt } from "./_shared";
import { user } from "./users";
import { order } from "./orders";
import type { MaterialUnit } from "@/features/materials/materials";

export const material = sqliteTable("Material", {
  id: cuidPk(),
  userId: text("userId").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: text("category").notNull(),
  usageUnit: text("usageUnit").notNull().$type<MaterialUnit>(),
  packageQuantity: real("packageQuantity").notNull(),
  packagePriceCents: integer("packagePriceCents").notNull(),
  supplier: text("supplier"),
  productUrl: text("productUrl"),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [index("Material_userId_name_idx").on(t.userId, t.name)]);

export const orderMaterial = sqliteTable("OrderMaterial", {
  id: cuidPk(),
  orderId: text("orderId").notNull().references(() => order.id, { onDelete: "cascade" }),
  materialId: text("materialId").notNull().references(() => material.id),
  name: text("name").notNull(),
  usageUnit: text("usageUnit").notNull().$type<MaterialUnit>(),
  unitCostCents: real("unitCostCents").notNull(),
  quantity: real("quantity").notNull(),
  supplier: text("supplier"),
  productUrl: text("productUrl"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => [
  uniqueIndex("OrderMaterial_orderId_materialId_key").on(t.orderId, t.materialId),
  index("OrderMaterial_materialId_idx").on(t.materialId),
]);

export type Material = typeof material.$inferSelect;
export type OrderMaterial = typeof orderMaterial.$inferSelect;
