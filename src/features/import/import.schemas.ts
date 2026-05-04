import { z } from "zod";
import { INGREDIENT_UNITS } from "@/db/schema/enums";
import { optionalHttpUrlSchema } from "@/lib/url";

const ingredientUnitSchema = z.enum(INGREDIENT_UNITS).nullable().optional();

/** Caps for free-text fields. See recipes.schemas.ts for matching constants. */
const MAX_RECIPE_NOTES = 20_000;
const MAX_INSTRUCTION_LINE = 5_000;
const MAX_INGREDIENT_LINE = 1_000;
const MAX_LINES_PER_RECIPE = 200;
const MAX_INGREDIENT_NAME = 500;

export const importDraftSchema = z.object({
  title: z.string().min(1).max(500),
  // Drafts come from URL parsing or image OCR; if a URL is present it
  // must be http/https — never `javascript:` or `data:`.
  sourceUrl: optionalHttpUrlSchema,
  imageUrl: optionalHttpUrlSchema,
  servings: z.number().int().min(0).optional(),
  prepTimeMinutes: z.number().int().min(0).optional(),
  cookTimeMinutes: z.number().int().min(0).optional(),
  totalTimeMinutes: z.number().int().min(0).optional(),
  ingredients: z
    .array(z.string().max(MAX_INGREDIENT_LINE))
    .max(MAX_LINES_PER_RECIPE),
  instructions: z
    .array(z.string().max(MAX_INSTRUCTION_LINE))
    .max(MAX_LINES_PER_RECIPE)
    .optional(),
  notes: z.string().max(MAX_RECIPE_NOTES).optional(),
});

export const suggestMappingsSchema = z.object({
  lines: z.array(z.string().max(MAX_INGREDIENT_LINE)).max(MAX_LINES_PER_RECIPE),
});

export const importIngredientLineSchema = z.object({
  originalLine: z.string().min(1).max(MAX_INGREDIENT_LINE),
  displayText: z.string().max(500).optional(),
  ingredientId: z.string().min(1).max(100).optional(),
  createName: z.string().max(MAX_INGREDIENT_NAME).optional(),
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
  sourceUrl: optionalHttpUrlSchema,
  imageUrl: optionalHttpUrlSchema,
  servings: z.coerce.number().int().min(0).optional(),
  prepTimeMinutes: z.coerce.number().int().min(0).optional(),
  cookTimeMinutes: z.coerce.number().int().min(0).optional(),
  totalTimeMinutes: z.coerce.number().int().min(0).optional(),
  instructions: z
    .array(z.string().max(MAX_INSTRUCTION_LINE))
    .max(MAX_LINES_PER_RECIPE)
    .min(1, "At least one instruction required"),
  notes: z.string().max(MAX_RECIPE_NOTES).optional(),
  tagIds: z.array(z.string().min(1)).max(50).optional().default([]),
});

export const saveImportedRecipeSchema = z.object({
  recipe: saveImportedRecipeRecipeSchema,
  ingredientLines: z
    .array(importIngredientLineSchema)
    .max(MAX_LINES_PER_RECIPE)
    .min(1, "At least one ingredient required"),
});

export const saveImportedRecipeTextOnlySchema = z.object({
  recipe: saveImportedRecipeRecipeSchema,
  ingredients: z
    .array(z.string().max(MAX_INGREDIENT_LINE))
    .max(MAX_LINES_PER_RECIPE)
    .min(1, "At least one ingredient required"),
});

export type ImportDraft = z.infer<typeof importDraftSchema>;
export type SuggestMappingsInput = z.infer<typeof suggestMappingsSchema>;
export type ImportIngredientLineInput = z.infer<typeof importIngredientLineSchema>;
export type SaveImportedRecipeInput = z.infer<typeof saveImportedRecipeSchema>;
export type SaveImportedRecipeTextOnlyInput = z.infer<typeof saveImportedRecipeTextOnlySchema>;
