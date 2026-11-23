import { z } from "zod";
import { MATERIAL_CATEGORIES, MATERIAL_UNITS } from "./materials";

export const materialQuantitySchema = z.number()
  .positive("Enter an amount greater than zero.")
  .max(1_000_000, "Amount must be 1,000,000 or less.");

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional()
  .transform((value) => value || null);

export const materialProductUrlSchema = optionalText(2048).pipe(
  z.url({ protocol: /^https?$/, error: "Enter a full http:// or https:// product URL." }).nullable(),
);

const materialFields = {
  name: z.string().trim().min(1, "Material name is required.").max(120),
  category: z.enum(MATERIAL_CATEGORIES),
  usageUnit: z.enum(MATERIAL_UNITS),
  packageQuantity: materialQuantitySchema,
  packagePriceCents: z.number().int().min(0).max(100_000_000),
  supplier: optionalText(120),
  productUrl: materialProductUrlSchema,
  notes: optionalText(500),
};

export const materialCreateSchema = z.object(materialFields).refine(
  (value) => Number.isSafeInteger(Math.round(value.packagePriceCents / value.packageQuantity * 1_000_000)),
  { path: ["packageQuantity"], message: "Package amount is too small for this price." },
);
export const materialUpdateSchema = z.object({ id: z.string().min(1).max(100), ...materialFields })
  .refine(
    (value) => Number.isSafeInteger(Math.round(value.packagePriceCents / value.packageQuantity * 1_000_000)),
    { path: ["packageQuantity"], message: "Package amount is too small for this price." },
  );

export const orderMaterialSchema = z.object({
  materialId: z.string().min(1).max(100),
  quantity: materialQuantitySchema,
});
export const orderMaterialsSchema = z.array(orderMaterialSchema).max(100)
  .refine((rows) => new Set(rows.map((row) => row.materialId)).size === rows.length, {
    message: "Add each material only once and update its amount used.",
  });

export type MaterialInput = z.infer<typeof materialCreateSchema>;
export type OrderMaterialInput = z.infer<typeof orderMaterialSchema>;
