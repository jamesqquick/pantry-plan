import { z } from "zod";

/** Allowed batch counts when adding a recipe to an order (UI + validation). */
export const ORDER_ITEM_BATCH_VALUES = [0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export const orderIdSchema = z.object({
  id: z.string().min(1, "Order id is required"),
});

export const orderItemSchema = z.object({
  recipeId: z.string().min(1, "Recipe is required"),
  batches: z
    .coerce
    .number()
    .min(0.5, "Batches must be at least 1/2")
    .refine(
      (v) =>
        ORDER_ITEM_BATCH_VALUES.some((allowed) => Math.abs(v - allowed) < 1e-9),
      "Batches must be 1/2 or a whole number from 1 to 10",
    ),
});

export const orderCreateSchema = z.object({
  name: z.string().min(1, "Name is required").transform((s) => s.trim()),
  notes: z.string().optional(),
  items: z.array(orderItemSchema).min(1, "Add at least one recipe"),
});

export const orderUpdateSchema = z.object({
  id: z.string().min(1, "Order id is required"),
  name: z.string().min(1, "Name is required").transform((s) => s.trim()),
  notes: z.string().optional(),
  items: z.array(orderItemSchema).min(1, "Add at least one recipe"),
});

export const orderGroceryCheckToggleSchema = z.object({
  orderId: z.string().min(1, "Order id is required"),
  ingredientId: z.string().min(1, "Ingredient id is required"),
  checked: z.boolean(),
});

export type OrderIdInput = z.infer<typeof orderIdSchema>;
export type OrderItemInput = z.infer<typeof orderItemSchema>;
export type OrderCreateInput = z.infer<typeof orderCreateSchema>;
export type OrderUpdateInput = z.infer<typeof orderUpdateSchema>;
export type OrderGroceryCheckToggleInput = z.infer<typeof orderGroceryCheckToggleSchema>;
