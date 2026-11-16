import { z } from "zod";

export const createTagSchema = z.object({
  name: z.string().min(1, "Tag name is required").max(100),
});

export const newRecipeTagNamesSchema = z.array(z.string().trim().min(1).max(100)).max(50);

export function recipeTagCountWithinLimit(value: { tagIds?: string[]; newTagNames?: string[] }) {
  return (value.tagIds?.length ?? 0) + (value.newTagNames?.length ?? 0) <= 50;
}

export const deleteTagSchema = z.object({
  id: z.string().min(1, "Tag id is required"),
});

/** For picker search: single query string, max 100 chars. */
export const tagSearchQuerySchema = z
  .string()
  .max(100)
  .transform((s) => s.trim());

export type CreateTagInput = z.infer<typeof createTagSchema>;
export type DeleteTagInput = z.infer<typeof deleteTagSchema>;
