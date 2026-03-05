import { z } from "zod";

export const recipeCreateSchema = z.object({
  title: z.string().min(1, "Title is required").max(500),
  sourceUrl: z.string().url().optional().or(z.literal("")),
  ingredients: z.string().min(1, "Ingredients are required"),
  instructions: z.string().optional(),
});

export const recipeUpdateSchema = recipeCreateSchema.partial().extend({
  id: z.string().min(1, "Recipe id is required"),
});

export const recipeIdSchema = z.object({
  id: z.string().min(1, "Recipe id is required"),
});

export const parseUrlSchema = z.object({
  url: z
    .string()
    .url("Invalid URL")
    .refine((u) => u.startsWith("http://") || u.startsWith("https://"), "Only http/https allowed")
    .refine(
      (u) => {
        try {
          const host = new URL(u).hostname.toLowerCase();
          if (host === "localhost" || host.endsWith(".localhost")) return false;
          if (["127.0.0.1", "0.0.0.0", "::1"].includes(host)) return false;
          if (/^10\.|^172\.(1[6-9]|2[0-9]|3[01])\.|^192\.168\./.test(host)) return false;
          return true;
        } catch {
          return false;
        }
      },
      { message: "URL not allowed (localhost/private)" }
    ),
});

export type RecipeCreateInput = z.infer<typeof recipeCreateSchema>;
export type RecipeUpdateInput = z.infer<typeof recipeUpdateSchema>;
export type RecipeIdInput = z.infer<typeof recipeIdSchema>;
export type ParseUrlInput = z.infer<typeof parseUrlSchema>;
