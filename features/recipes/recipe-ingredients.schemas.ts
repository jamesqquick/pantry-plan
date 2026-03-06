import { z } from "zod";
import { IngredientUnit } from "@/generated/prisma/client";

const ingredientUnitSchema = z.nativeEnum(IngredientUnit).optional();

export const recipeIngredientItemSchema = z.object({
  id: z.string().optional(),
  /** When empty/null, line is stored as unmapped (excluded from cost/totals). */
  ingredientId: z.string().min(1).optional().or(z.literal("")),
  quantity: z
    .number()
    .min(0, "Quantity must be 0 or greater")
    .finite("Quantity must be finite")
    .optional()
    .nullable(),
  unit: ingredientUnitSchema.nullable(),
  /** Ingredient line without quantity/unit; editable. */
  displayText: z.string().min(1, "Ingredient line is required"),
  /** True when user has manually edited displayText. */
  isLineTextOverridden: z.boolean().optional(),
  /** Full raw line (e.g. from import); optional. */
  rawText: z.string().optional().nullable(),
  sortOrder: z.coerce.number().int().min(0),
});

export const setRecipeIngredientsSchema = z.object({
  recipeId: z.string().min(1, "Recipe id is required"),
  items: z.array(recipeIngredientItemSchema),
});

export const recipeIdOnlySchema = z.object({
  recipeId: z.string().min(1, "Recipe id is required"),
});

export type RecipeIngredientItemInput = z.infer<typeof recipeIngredientItemSchema>;
export type SetRecipeIngredientsInput = z.infer<typeof setRecipeIngredientsSchema>;
export type RecipeIdOnlyInput = z.infer<typeof recipeIdOnlySchema>;
