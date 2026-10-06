/**
 * Builds the Markdown document that represents one recipe in AI Search.
 * Pure (no I/O) so the content hash is deterministic and easy to test.
 */

/** Bump to force every recipe to re-upload after a document format change. */
export const RECIPE_DOCUMENT_VERSION = 1;

export type RecipeDocumentInput = {
  id: string;
  userId: string;
  title: string;
  notes: string | null;
  servings: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  totalTimeMinutes: number | null;
  tags: string[];
  ingredients: { text: string; name: string | null }[];
  instructions: string[];
};

export type RecipeDocument = {
  key: string;
  content: string;
  metadata: { user_id: string; recipe_id: string };
};

export function recipeDocumentKey(userId: string, recipeId: string): string {
  return `users/${userId}/recipes/${recipeId}.md`;
}

function formatIngredient({ text, name }: RecipeDocumentInput["ingredients"][number]) {
  const trimmed = text.trim();
  if (!name || trimmed.toLowerCase().includes(name.toLowerCase())) {
    return `- ${trimmed}`;
  }
  return `- ${trimmed} (${name})`;
}

export function buildRecipeDocument(input: RecipeDocumentInput): RecipeDocument {
  const lines = [`# ${input.title.trim()}`, ""];

  const facts = [
    input.tags.length > 0 ? `Tags: ${[...input.tags].sort().join(", ")}` : null,
    input.servings != null ? `Servings: ${input.servings}` : null,
    input.prepTimeMinutes != null ? `Prep time: ${input.prepTimeMinutes} minutes` : null,
    input.cookTimeMinutes != null ? `Cook time: ${input.cookTimeMinutes} minutes` : null,
    input.totalTimeMinutes != null ? `Total time: ${input.totalTimeMinutes} minutes` : null,
  ].filter((fact): fact is string => fact !== null);
  if (facts.length > 0) lines.push(...facts, "");

  if (input.ingredients.length > 0) {
    lines.push("## Ingredients", ...input.ingredients.map(formatIngredient), "");
  }

  const steps = input.instructions.map((step) => step.trim()).filter(Boolean);
  if (steps.length > 0) {
    lines.push("## Instructions", ...steps.map((step, i) => `${i + 1}. ${step}`), "");
  }

  const notes = input.notes?.trim();
  if (notes) lines.push("## Notes", notes, "");

  return {
    key: recipeDocumentKey(input.userId, input.id),
    content: lines.join("\n"),
    metadata: { user_id: input.userId, recipe_id: input.id },
  };
}

export async function hashRecipeDocument(document: RecipeDocument): Promise<string> {
  const payload = JSON.stringify({ version: RECIPE_DOCUMENT_VERSION, ...document });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
