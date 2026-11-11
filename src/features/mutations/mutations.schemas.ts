import { z } from "zod";

export const mutationInputSchema = z.object({
  operationId: z.uuid(),
  accountId: z.string().min(1).max(100),
});

export const MUTATION_KINDS = [
  "recipes.create",
  "recipes.duplicate",
  "recipeImport.saveTextOnly",
] as const;

export type MutationKind = (typeof MUTATION_KINDS)[number];
