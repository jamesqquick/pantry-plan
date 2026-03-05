import { z } from "zod";

export const createVariantRecipeSchema = z.object({
  baseRecipeId: z.string().min(1, "Base recipe is required"),
  title: z.string().min(1, "Variant name is required").max(500),
});

export const upsertVariantOverrideSchema = z.object({
  variantRecipeId: z.string().min(1),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  originalLine: z.string().min(1),
  ingredientId: z.string().min(1),
  sortOrder: z.number().int().min(0),
});

export const setVariantRemoveSchema = z.object({
  variantRecipeId: z.string().min(1),
  remove: z.boolean(),
});

export const addVariantIngredientSchema = z.object({
  variantRecipeId: z.string().min(1),
  ingredientId: z.string().min(1),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
});

export const startOverrideFromBaseSchema = z.object({
  variantRecipeId: z.string().min(1),
});

export const updateOverrideSchema = z.object({
  variantRecipeId: z.string().min(1),
  ingredientId: z.string().min(1),
  originalLine: z.string().min(1),
  quantity: z.number().nullable(),
  unit: z.string().nullable(),
  sortOrder: z.number().int().min(0),
});

export const revertOverrideSchema = z.object({
  variantRecipeId: z.string().min(1),
});

export const deleteAddedIngredientSchema = z.object({
  variantRecipeId: z.string().min(1),
  addedIngredientRowId: z.string().min(1),
});
