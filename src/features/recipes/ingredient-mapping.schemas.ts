import { z } from "zod";
import { requiredIngredientMeasurementsSchema } from "./ingredient-measurements";
import {
  MAX_INGREDIENT_LINE,
  MAX_LINES_PER_RECIPE,
} from "@/features/import/import.schemas";

const idSchema = z.string().trim().min(1).max(100);

export const ingredientMappingSelectionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("existing"),
      ingredientId: idSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("create"),
      name: z.string().trim().min(1).max(500),
    })
    .strict(),
  z.object({ kind: z.literal("unmapped") }).strict(),
]);

export const ingredientMappingItemSchema = z
  .object({
    recipeIngredientId: idSchema,
    recipeIngredientUpdatedAt: z.number().int().nonnegative(),
    displayText: z.string().trim().min(1).max(MAX_INGREDIENT_LINE),
    ...requiredIngredientMeasurementsSchema.shape,
    mapping: ingredientMappingSelectionSchema,
  })
  .strict();

export const ingredientMappingPreviewSchema = z
  .object({
    recipeId: idSchema,
  })
  .strict();

export const ingredientMappingApplySchema = z
  .object({
    recipeId: idSchema,
    items: z.array(ingredientMappingItemSchema).max(MAX_LINES_PER_RECIPE),
  })
  .strict();

export type IngredientMappingSelection = z.infer<
  typeof ingredientMappingSelectionSchema
>;
export type IngredientMappingItemInput = z.infer<
  typeof ingredientMappingItemSchema
>;
export type IngredientMappingPreviewInput = z.infer<
  typeof ingredientMappingPreviewSchema
>;
export type IngredientMappingApplyInput = z.infer<
  typeof ingredientMappingApplySchema
>;
