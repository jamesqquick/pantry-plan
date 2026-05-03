import { z } from "zod";
import { optionalHttpUrlSchema } from "@/lib/url";

const stringArray = z
  .array(z.string())
  .transform((arr) => arr.map((s) => s.trim()).filter(Boolean))
  .pipe(z.array(z.string().min(1)).min(1, "At least one item required"));

const stringArrayOptional = z
  .array(z.string())
  .optional()
  .default([]);

export const recipeCreateSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
  // optionalHttpUrlSchema rejects `javascript:`, `data:`, `file:`, etc.
  // The empty string is treated as "no URL provided".
  sourceUrl: optionalHttpUrlSchema,
  imageUrl: optionalHttpUrlSchema,
  servings: z.coerce.number().int().min(0).optional(),
  prepTimeMinutes: z.coerce.number().int().min(0).optional(),
  cookTimeMinutes: z.coerce.number().int().min(0).optional(),
  totalTimeMinutes: z.coerce.number().int().min(0).optional(),
  ingredients: stringArrayOptional,
  instructions: stringArray,
  notes: z.string().optional(),
  tagIds: z.array(z.string().min(1)).optional().default([]),
});

export const recipeUpdateSchema = recipeCreateSchema.partial().extend({
  id: z.string().min(1, "Recipe id is required"),
});

export const recipeIdSchema = z.object({
  id: z.string().min(1, "Recipe id is required"),
});

export const duplicateRecipeSchema = z.object({
  recipeId: z.string().min(1, "Recipe id is required"),
});

export type RecipeCreateInput = z.infer<typeof recipeCreateSchema>;
export type RecipeUpdateInput = z.infer<typeof recipeUpdateSchema>;
export type RecipeIdInput = z.infer<typeof recipeIdSchema>;
