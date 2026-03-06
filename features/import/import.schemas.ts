import { z } from "zod";
import { IngredientUnit } from "@/generated/prisma/client";

const ingredientUnitSchema = z.nativeEnum(IngredientUnit).nullable().optional();

export const importDraftSchema = z.object({
  title: z.string().min(1).max(500),
  sourceUrl: z.string().optional(),
  imageUrl: z.string().optional(),
  servings: z.number().int().min(0).optional(),
  prepTimeMinutes: z.number().int().min(0).optional(),
  cookTimeMinutes: z.number().int().min(0).optional(),
  totalTimeMinutes: z.number().int().min(0).optional(),
  ingredients: z.array(z.string()),
  instructions: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

export const suggestMappingsSchema = z.object({
  lines: z.array(z.string()).max(200),
});

export const importIngredientLineSchema = z.object({
  originalLine: z.string().min(1),
  displayText: z.string().max(500).optional(),
  ingredientId: z.string().min(1).optional(),
  createName: z.string().optional(),
  quantity: z
    .number()
    .min(0, "Quantity must be 0 or greater")
    .finite("Quantity must be finite")
    .nullable()
    .optional(),
  unit: ingredientUnitSchema,
  sortOrder: z.number().int().min(0),
});

export const saveImportedRecipeRecipeSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
  sourceUrl: z.string().url().optional().or(z.literal("")),
  imageUrl: z.string().url().optional().or(z.literal("")),
  servings: z.coerce.number().int().min(0).optional(),
  prepTimeMinutes: z.coerce.number().int().min(0).optional(),
  cookTimeMinutes: z.coerce.number().int().min(0).optional(),
  totalTimeMinutes: z.coerce.number().int().min(0).optional(),
  instructions: z.array(z.string()).min(1, "At least one instruction required"),
  notes: z.string().optional(),
  tagIds: z.array(z.string().min(1)).optional().default([]),
});

export const saveImportedRecipeSchema = z.object({
  recipe: saveImportedRecipeRecipeSchema,
  ingredientLines: z.array(importIngredientLineSchema).min(1, "At least one ingredient required"),
});

export const saveImportedRecipeTextOnlySchema = z.object({
  recipe: saveImportedRecipeRecipeSchema,
  ingredients: z.array(z.string().max(1000)).min(1, "At least one ingredient required"),
});

export type ImportDraft = z.infer<typeof importDraftSchema>;
export type SuggestMappingsInput = z.infer<typeof suggestMappingsSchema>;
export type ImportIngredientLineInput = z.infer<typeof importIngredientLineSchema>;
export type SaveImportedRecipeInput = z.infer<typeof saveImportedRecipeSchema>;
export type SaveImportedRecipeTextOnlyInput = z.infer<typeof saveImportedRecipeTextOnlySchema>;
