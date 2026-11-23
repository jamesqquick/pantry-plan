import { ActionError } from "astro:actions";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { material, orderMaterial, type Db } from "@/db";
import { chunkInValues } from "@/db/chunked-read";
import { chunkRows } from "@/db/chunked-insert";
import { materialUnitCost } from "./materials";
import type { OrderMaterialInput } from "./materials.schemas";

export async function orderMaterialStatements(
  db: Db, userId: string, orderId: string, items: OrderMaterialInput[],
) {
  const catalog: (typeof material.$inferSelect)[] = [];
  for (const ids of chunkInValues(items.map((item) => item.materialId), 1)) {
    catalog.push(...await db.select().from(material)
      .where(and(eq(material.userId, userId), inArray(material.id, ids))));
  }
  if (catalog.length !== items.length) {
    throw new ActionError({ code: "FORBIDDEN", message: "One or more materials not found or not yours." });
  }
  const byId = new Map(catalog.map((item) => [item.id, item]));
  const rows = items.map((item) => {
    const source = byId.get(item.materialId)!;
    return {
      orderId, materialId: source.id, name: source.name, usageUnit: source.usageUnit,
      unitCostCents: materialUnitCost(source), quantity: item.quantity,
      supplier: source.supplier, productUrl: source.productUrl,
    };
  });

  // Only the quantity changes on conflict, including concurrent saves of the same material.
  const writes = chunkRows(rows, 12).map((chunk) => db.insert(orderMaterial).values(chunk)
    .onConflictDoUpdate({
      target: [orderMaterial.orderId, orderMaterial.materialId],
      set: { quantity: sql`excluded.quantity`, updatedAt: new Date() },
    }));
  if (items.length === 0) {
    return [db.delete(orderMaterial).where(eq(orderMaterial.orderId, orderId))];
  }
  // A JSON list keeps the removal query below D1's bound-parameter limit.
  return [
    db.delete(orderMaterial).where(and(
      eq(orderMaterial.orderId, orderId),
      notInArray(orderMaterial.materialId, sql`(select value from json_each(${JSON.stringify(items.map((item) => item.materialId))}))`),
    )),
    ...writes,
  ];
}
