import { z } from "zod";
import { IngredientUnit, CostBasisUnit } from "@/generated/prisma/client";

const ingredientUnitSchema = z.nativeEnum(IngredientUnit);
const costBasisUnitSchema = z.nativeEnum(CostBasisUnit);

export const ingredientDisplayUnitSchema = z.enum([
  "AUTO",
  "GRAM",
  "CUP",
  "EACH",
  "TBSP",
  "TSP",
]);

export const globalIngredientByIdSchema = z.object({
  id: z.string().min(1, "Ingredient id is required"),
});

export const ingredientCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(500),
  category: z.string().max(100).optional(),
  defaultUnit: ingredientUnitSchema.optional(),
  costBasisUnit: costBasisUnitSchema,
  estimatedCentsPerBasisUnit: z.coerce.number().min(0).nullable().optional(),
  notes: z.string().max(2000).optional(),
  /** Optional global ingredient id (validated server-side: must exist and userId null). */
  baseIngredientId: z.string().min(1).max(100).optional(),
});

export const ingredientUpdateSchema = ingredientCreateSchema.extend({
  id: z.string().min(1, "Ingredient id is required"),
  preferredDisplayUnit: ingredientDisplayUnitSchema,
});

export const ingredientIdSchema = z.object({
  id: z.string().min(1, "Ingredient id is required"),
});

export const ingredientNameSchema = z.object({
  name: z.string().min(1, "Name is required").max(500),
});

/** For picker search: single query string, max 100 chars. */
export const ingredientSearchQuerySchema = z
  .string()
  .max(100)
  .transform((s) => s.trim());

export type IngredientCreateInput = z.infer<typeof ingredientCreateSchema>;
export type IngredientUpdateInput = z.infer<typeof ingredientUpdateSchema>;
export type IngredientIdInput = z.infer<typeof ingredientIdSchema>;
export type IngredientNameInput = z.infer<typeof ingredientNameSchema>;
