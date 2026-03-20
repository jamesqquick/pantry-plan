import { z } from "zod";

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
      (v) => [0.5, 1, 2, 3].some((allowed) => Math.abs(v - allowed) < 1e-9),
      "Batches must be 1/2, 1, 2, or 3",
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

export type OrderIdInput = z.infer<typeof orderIdSchema>;
export type OrderItemInput = z.infer<typeof orderItemSchema>;
export type OrderCreateInput = z.infer<typeof orderCreateSchema>;
export type OrderUpdateInput = z.infer<typeof orderUpdateSchema>;
