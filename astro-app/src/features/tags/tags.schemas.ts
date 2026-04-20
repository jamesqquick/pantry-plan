import { z } from "zod";

export const createTagSchema = z.object({
  name: z.string().min(1, "Tag name is required").max(100),
});

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
