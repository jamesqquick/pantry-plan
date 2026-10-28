import { describe, expect, it } from "vitest";
import {
  orderCreateSchema,
  orderStatusUpdateSchema,
  orderUpdateSchema,
} from "./orders.schemas";

const item = { recipeId: "recipe-123", batches: 2 };

describe("order schemas", () => {
  it("defaults new orders to draft and pickup", () => {
    expect(orderCreateSchema.parse({ name: "Birthday cookies", items: [item] })).toMatchObject({
      status: "DRAFT",
      fulfillmentMethod: "PICKUP",
    });
  });

  it("trims and accepts optional customer and fulfillment details", () => {
    const result = orderCreateSchema.parse({
      name: "  Birthday cookies  ",
      customerName: "  Sarah Morgan  ",
      customerContact: "  sarah@example.com  ",
      dueDate: "2026-10-24",
      dueTime: "14:00",
      fulfillmentMethod: "DELIVERY",
      deliveryAddress: "  123 Sample Street  ",
      status: "CONFIRMED",
      items: [item],
    });

    expect(result).toMatchObject({
      name: "Birthday cookies",
      customerName: "Sarah Morgan",
      customerContact: "sarah@example.com",
      dueDate: "2026-10-24",
      dueTime: "14:00",
      fulfillmentMethod: "DELIVERY",
      deliveryAddress: "123 Sample Street",
      status: "CONFIRMED",
    });
  });

  it("treats empty optional form fields as unset", () => {
    const result = orderCreateSchema.parse({
      name: "Order",
      customerName: "   ",
      customerContact: "",
      dueDate: "",
      dueTime: "",
      deliveryAddress: "",
      items: [item],
    });

    expect(result.customerName).toBeNull();
    expect(result.customerContact).toBeNull();
    expect(result.dueDate).toBeNull();
    expect(result.dueTime).toBeNull();
    expect(result.deliveryAddress).toBeNull();
  });

  it("rejects whitespace-only names and invalid dates, times, and fulfillment values", () => {
    const valid = { name: "Order", items: [item] };

    expect(orderCreateSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
    expect(orderCreateSchema.safeParse({ ...valid, dueDate: "2026-02-31" }).success).toBe(false);
    expect(orderCreateSchema.safeParse({ ...valid, dueTime: "25:60" }).success).toBe(false);
    expect(orderCreateSchema.safeParse({ ...valid, fulfillmentMethod: "COURIER" }).success).toBe(false);
    expect(orderCreateSchema.safeParse({ ...valid, status: "PAID" }).success).toBe(false);
  });

  it("allows an order status to be updated independently of its items", () => {
    expect(orderStatusUpdateSchema.parse({ id: "order-123", status: "READY" })).toEqual({
      id: "order-123",
      status: "READY",
    });
    expect(orderStatusUpdateSchema.safeParse({ id: "order-123", status: "PAID" }).success).toBe(false);
  });

  it("accepts the same details when replacing an existing order", () => {
    expect(orderUpdateSchema.parse({
      id: "order-123",
      name: "Order",
      customerName: "Taylor",
      fulfillmentMethod: "PICKUP",
      status: "COMPLETED",
      items: [item],
    })).toMatchObject({
      id: "order-123",
      customerName: "Taylor",
      fulfillmentMethod: "PICKUP",
      status: "COMPLETED",
    });
  });
});
