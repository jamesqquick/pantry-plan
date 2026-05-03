import { z } from "zod";
import { optionalHttpUrlSchema } from "@/lib/url";

/**
 * Caps on free-text fields. Sized to comfortably hold real recipe data
 * while preventing storage abuse (e.g. a single user planting 5 MB of
 * notes per record). Keep these constants in sync with any UI hints.
 */
const MAX_RECIPE_NOTES = 20_000;
const MAX_INSTRUCTION_LINE = 5_000;
const MAX_INGREDIENT_LINE = 500;
const MAX_LINES_PER_RECIPE = 200;

/** Optional ingredient list: each line capped, total length capped. */
const ingredientLinesOptional = z
  .array(z.string().max(MAX_INGREDIENT_LINE))
  .max(MAX_LINES_PER_RECIPE)
  .optional()
  .default([]);

/**
 * Required instruction list: each step capped at MAX_INSTRUCTION_LINE,
 * total steps capped, blanks stripped, must have at least one non-empty
 * step after trimming.
 */
const instructionLinesRequired = z
  .array(z.string().max(MAX_INSTRUCTION_LINE))
  .max(MAX_LINES_PER_RECIPE)
  .transform((arr) => arr.map((s) => s.trim()).filter(Boolean))
  .pipe(z.array(z.string().min(1)).min(1, "At least one item required"));

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
  ingredients: ingredientLinesOptional,
  instructions: instructionLinesRequired,
  notes: z.string().max(MAX_RECIPE_NOTES).optional(),
  tagIds: z.array(z.string().min(1)).max(50).optional().default([]),
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
