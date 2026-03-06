import type { IngredientUnit } from "@/generated/prisma/client";
import { z } from "zod";

const llmUnitSchema = z.string().max(20).optional().nullable();

export const urlStructuredIngredientSchema = z.object({
  sortOrder: z.number().int().min(0),
  quantity: z
    .number()
    .min(0)
    .finite()
    .nullable()
    .optional(),
  unit: llmUnitSchema,
  displayText: z.string().max(500),
  rawText: z.string().max(1000),
  ingredientId: z.string().min(1).optional(),
  suggestedCreateName: z.string().max(500).optional(),
});

export const urlToStructuredRecipeResponseSchema = z.object({
  title: z.string().min(1).max(500),
  sourceUrl: z.string().max(2000).optional(),
  imageUrl: z.string().max(2000).optional(),
  servings: z.number().int().min(0).optional(),
  prepTimeMinutes: z.number().int().min(0).optional(),
  cookTimeMinutes: z.number().int().min(0).optional(),
  totalTimeMinutes: z.number().int().min(0).optional(),
  instructions: z.array(z.string().max(5000)),
  notes: z.string().max(5000).optional(),
  structuredIngredients: z.array(urlStructuredIngredientSchema),
});

export type UrlStructuredIngredient = z.infer<typeof urlStructuredIngredientSchema>;
export type UrlToStructuredRecipeResponse = z.infer<typeof urlToStructuredRecipeResponseSchema>;

export type StructuredItemFromParse = {
  sortOrder: number;
  quantity: number | null;
  unit: IngredientUnit | null;
  displayText: string;
  rawText: string;
  ingredientId?: string;
  ingredientName?: string;
  suggestedCreateName?: string;
};
