import { z } from "zod";
import {
  ORDER_FULFILLMENT_METHODS,
  ORDER_STATUSES,
} from "@/db/schema/enums";

/** Allowed batch counts when adding a recipe to an order (UI + validation). */
export const ORDER_ITEM_BATCH_VALUES = [0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

const MAX_ORDER_NAME = 200;
const MAX_ORDER_NOTES = 5_000;
const MAX_ORDER_ITEMS = 500;
const MAX_CUSTOMER_NAME = 200;
const MAX_CUSTOMER_CONTACT = 254;
const MAX_DELIVERY_ADDRESS = 1_000;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null)
    .nullable()
    .optional();

const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Enter a valid date");

const optionalDate = z.preprocess(
  (value) => (value === "" ? null : value),
  dateStringSchema.nullable().optional(),
);

const optionalTime = z.preprocess(
  (value) => (value === "" ? null : value),
  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a valid time").nullable().optional(),
);

const optionalOrderDetails = {
  customerName: optionalText(MAX_CUSTOMER_NAME),
  customerContact: optionalText(MAX_CUSTOMER_CONTACT),
  dueDate: optionalDate,
  dueTime: optionalTime,
  deliveryAddress: optionalText(MAX_DELIVERY_ADDRESS),
};

const orderStatusSchema = z.enum(ORDER_STATUSES);
const fulfillmentMethodSchema = z.enum(ORDER_FULFILLMENT_METHODS);

export const orderIdSchema = z.object({
  id: z.string().min(1, "Order id is required"),
});

export const orderItemSchema = z.object({
  recipeId: z.string().min(1, "Recipe is required").max(100),
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
  name: z
    .string()
    .max(MAX_ORDER_NAME)
    .trim()
    .min(1, "Name is required"),
  notes: z.string().max(MAX_ORDER_NOTES).optional(),
  ...optionalOrderDetails,
  fulfillmentMethod: fulfillmentMethodSchema.default("PICKUP"),
  status: orderStatusSchema.default("DRAFT"),
  items: z
    .array(orderItemSchema)
    .max(MAX_ORDER_ITEMS)
    .min(1, "Add at least one recipe"),
});

export const orderUpdateSchema = z.object({
  id: z.string().min(1, "Order id is required"),
  name: z
    .string()
    .max(MAX_ORDER_NAME)
    .trim()
    .min(1, "Name is required"),
  notes: z.string().max(MAX_ORDER_NOTES).optional(),
  ...optionalOrderDetails,
  fulfillmentMethod: fulfillmentMethodSchema.optional(),
  status: orderStatusSchema.optional(),
  items: z
    .array(orderItemSchema)
    .max(MAX_ORDER_ITEMS)
    .min(1, "Add at least one recipe"),
});

export const orderStatusUpdateSchema = z.object({
  id: z.string().min(1, "Order id is required"),
  status: orderStatusSchema,
});

export type OrderIdInput = z.infer<typeof orderIdSchema>;
export type OrderItemInput = z.infer<typeof orderItemSchema>;
export type OrderCreateInput = z.infer<typeof orderCreateSchema>;
export type OrderUpdateInput = z.infer<typeof orderUpdateSchema>;
export type OrderStatusUpdateInput = z.infer<typeof orderStatusUpdateSchema>;
