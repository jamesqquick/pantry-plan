import { z } from "zod";
import { INGREDIENT_UNITS } from "@/db/schema/enums";

const ingredientUnitSchema = z.enum(INGREDIENT_UNITS).optional();

const MAX_INGREDIENT_LINE_DISPLAY = 500;
const MAX_INGREDIENT_LINE_RAW = 1_000;
const MAX_LINES_PER_RECIPE = 200;

export const recipeIngredientItemSchema = z.object({
  id: z.string().max(100).optional(),
  /** When empty/null, line is stored as unmapped (excluded from cost/totals). */
  ingredientId: z.string().min(1).max(100).optional().or(z.literal("")),
  quantity: z
    .number()
    .min(0, "Quantity must be 0 or greater")
    .finite("Quantity must be finite")
    .optional()
    .nullable(),
  unit: ingredientUnitSchema.nullable(),
  /** Ingredient line without quantity/unit; editable. */
  displayText: z
    .string()
    .min(1, "Ingredient line is required")
    .max(MAX_INGREDIENT_LINE_DISPLAY),
  /** Full raw line (e.g. from import); optional. */
  rawText: z.string().max(MAX_INGREDIENT_LINE_RAW).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0),
});

export const setRecipeIngredientsSchema = z.object({
  recipeId: z.string().min(1, "Recipe id is required"),
  items: z.array(recipeIngredientItemSchema).max(MAX_LINES_PER_RECIPE),
});

export const recipeIdOnlySchema = z.object({
  recipeId: z.string().min(1, "Recipe id is required"),
});

export type RecipeIngredientItemInput = z.infer<typeof recipeIngredientItemSchema>;
export type SetRecipeIngredientsInput = z.infer<typeof setRecipeIngredientsSchema>;
export type RecipeIdOnlyInput = z.infer<typeof recipeIdOnlySchema>;
