import { z } from "zod";

export const orderIdSchema = z.object({
  id: z.string().min(1, "Order id is required"),
});

export const orderItemSchema = z.object({
  recipeId: z.string().min(1, "Recipe is required"),
  batches: z.coerce.number().int().min(1, "Batches must be at least 1"),
});

export const orderCreateSchema = z.object({
  name: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(orderItemSchema).min(1, "Add at least one recipe"),
});

export const orderUpdateSchema = z.object({
  id: z.string().min(1, "Order id is required"),
  name: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(orderItemSchema).min(1, "Add at least one recipe"),
});

export type OrderIdInput = z.infer<typeof orderIdSchema>;
export type OrderItemInput = z.infer<typeof orderItemSchema>;
export type OrderCreateInput = z.infer<typeof orderCreateSchema>;
export type OrderUpdateInput = z.infer<typeof orderUpdateSchema>;
