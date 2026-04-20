import { z } from "zod";

export const estimateOrderSchema = z.object({
  orderId: z.string().min(1, "Order id is required"),
});

export type EstimateOrderInput = z.infer<typeof estimateOrderSchema>;
