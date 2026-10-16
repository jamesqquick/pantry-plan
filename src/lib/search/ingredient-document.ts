/** Bump when the indexed document format changes. */
export const INGREDIENT_DOCUMENT_VERSION = 1;
export const MAX_INGREDIENT_DOCUMENT_NAME_LENGTH = 500;
export const MAX_INGREDIENT_DOCUMENT_ALIASES = 20;
export const MAX_INGREDIENT_DOCUMENT_ALIAS_LENGTH = 200;
export const MAX_INGREDIENT_DOCUMENT_NOTES_LENGTH = 1_000;
export const MAX_INGREDIENT_DOCUMENT_CATEGORY_LENGTH = 100;

export type IngredientDocumentInput = {
  id: string;
  userId: string | null;
  name: string;
  normalizedName: string;
  aliases: readonly string[];
  category?: string | null;
  notes?: string | null;
};

export type IngredientDocument = {
  key: string;
  content: string;
  metadata: { ingredient_id: string; scope_key: string };
};

export class IngredientDocumentValidationError extends Error {
  constructor(
    public readonly ingredientId: string,
    public readonly field: "name" | "normalizedName",
    public readonly length: number,
  ) {
    super(`Invalid ingredient document: ${ingredientId}, ${field} length ${length} exceeds ${MAX_INGREDIENT_DOCUMENT_NAME_LENGTH}`);
    this.name = "IngredientDocumentValidationError";
  }
}

export function ingredientScopeKey(userId: string | null): string {
  return userId === null ? "global" : `user:${userId}`;
}

export function ingredientDocumentKey(ingredientId: string): string {
  return `ingredients/${ingredientId}.md`;
}

export function buildIngredientDocument(input: IngredientDocumentInput): IngredientDocument {
  for (const field of ["name", "normalizedName"] as const) {
    if (input[field].length > MAX_INGREDIENT_DOCUMENT_NAME_LENGTH) {
      throw new IngredientDocumentValidationError(input.id, field, input[field].length);
    }
  }
  const aliases = [...new Set(input.aliases.map((alias) => alias.trim()))]
    .filter((alias) => alias.length > 0 && alias.length <= MAX_INGREDIENT_DOCUMENT_ALIAS_LENGTH)
    .sort()
    .slice(0, MAX_INGREDIENT_DOCUMENT_ALIASES);
  const category = input.category?.trim().slice(0, MAX_INGREDIENT_DOCUMENT_CATEGORY_LENGTH);
  const notes = input.notes?.trim().slice(0, MAX_INGREDIENT_DOCUMENT_NOTES_LENGTH);
  const lines = [`# ${input.name.trim()}`, "", `Normalized name: ${input.normalizedName.trim()}`];
  if (category) lines.push(`Category: ${category}`);
  if (aliases.length > 0) lines.push("", "## Aliases", ...aliases.map((alias) => `- ${alias}`));
  if (notes) lines.push("", "## Notes", notes);
  lines.push("");

  return {
    key: ingredientDocumentKey(input.id),
    content: lines.join("\n"),
    metadata: { ingredient_id: input.id, scope_key: ingredientScopeKey(input.userId) },
  };
}

export async function hashIngredientDocument(document: IngredientDocument): Promise<string> {
  const payload = JSON.stringify({ version: INGREDIENT_DOCUMENT_VERSION, ...document });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
