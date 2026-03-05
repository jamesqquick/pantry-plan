import { z } from "zod";
import { IngredientUnit } from "@prisma/client";

const ingredientUnitSchema = z.nativeEnum(IngredientUnit);
const costBasisUnitSchema = z.enum(["GRAM", "CUP", "EACH"]);

export const ingredientDisplayUnitSchema = z.enum([
  "AUTO",
  "GRAM",
  "CUP",
  "EACH",
  "TBSP",
  "TSP",
]);

export const ingredientPreferencesSchema = z.object({
  ingredientId: z.string().min(1, "Ingredient id is required"),
  preferredDisplayUnit: ingredientDisplayUnitSchema,
});

export const ingredientCreateSchema = z.object({
  name: z.string().min(1, "Name is required").max(500),
  category: z.string().max(100).optional(),
  defaultUnit: ingredientUnitSchema.optional(),
  costBasisUnit: costBasisUnitSchema,
  estimatedCentsPerBasisUnit: z.coerce.number().min(0).nullable().optional(),
  notes: z.string().max(2000).optional(),
});

export const ingredientUpdateSchema = ingredientCreateSchema.extend({
  id: z.string().min(1, "Ingredient id is required"),
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
export type IngredientPreferencesInput = z.infer<typeof ingredientPreferencesSchema>;
