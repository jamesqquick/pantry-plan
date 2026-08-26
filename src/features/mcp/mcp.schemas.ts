import { z } from "zod";
import { optionalHttpUrlSchema } from "@/lib/url";

const recipeToolFields = {
  title: z.string().trim().min(1).max(500),
  sourceUrl: optionalHttpUrlSchema,
  imageUrl: optionalHttpUrlSchema,
  servings: z.number().int().min(0).optional(),
  prepTimeMinutes: z.number().int().min(0).optional(),
  cookTimeMinutes: z.number().int().min(0).optional(),
  totalTimeMinutes: z.number().int().min(0).optional(),
  ingredients: z.array(z.string().trim().min(1).max(1_000)).min(1).max(200),
  instructions: z.array(z.string().trim().min(1).max(5_000)).min(1).max(200),
  notes: z.string().max(20_000).optional(),
};

export const createRecipeToolSchema = z.object(recipeToolFields);

export const importRecipeFromUrlToolSchema = z.object({
  url: z.string().max(2_048),
});

export const createMcpApiKeySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
});

export const revokeMcpApiKeySchema = z.object({
  id: z.string().min(1, "Key id is required").max(100),
});
