/**
 * Extract recipe from an image using Workers AI (Gemma 4 26B).
 *
 * Sends the image to the vision model with JSON mode and parses the
 * structured recipe draft from the response.
 */

import {
  workersAiVisionJson,
} from "./workers-ai-client";

export type ExtractedRecipeDraft = {
  title: string;
  ingredients: string[];
  instructions: string[];
  servings?: number;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  totalTimeMinutes?: number;
  notes?: string;
};

const RECIPE_EXTRACTION_PROMPT = `Extract the recipe from this image. Return a single JSON object with exactly these keys (use empty arrays or omit optional keys if not found):
- title (string): recipe name
- ingredients (array of strings): one full ingredient line per string, exactly as written (include quantity and unit). e.g. "2 1/4 cups all-purpose flour", "2 large eggs, room temperature"
- instructions (array of strings): one step per element; there must be at least one instruction
- servings (number, optional)
- prepTimeMinutes (number, optional)
- cookTimeMinutes (number, optional)
- totalTimeMinutes (number, optional)
- notes (string, optional)

Return only the JSON object, no markdown or other text.`;

function parseExtractedDraft(rawContent: string): ExtractedRecipeDraft {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent) as unknown;
  } catch {
    throw new Error("Could not parse recipe JSON from image.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid recipe format from image.");
  }

  const obj = parsed as Record<string, unknown>;
  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  const ingredients = Array.isArray(obj.ingredients)
    ? (obj.ingredients as unknown[])
        .map((x) => (typeof x === "string" ? x.trim() : String(x)))
        .filter(Boolean)
    : [];
  const instructions = Array.isArray(obj.instructions)
    ? (obj.instructions as unknown[])
        .map((x) => (typeof x === "string" ? x.trim() : String(x)))
        .filter(Boolean)
    : [];

  if (!title) throw new Error("Could not read recipe title from image.");
  if (instructions.length === 0) {
    throw new Error("Could not read recipe instructions from image.");
  }

  const asNumber = (v: unknown): number | undefined => {
    if (typeof v === "number" && Number.isInteger(v) && v >= 0) return v;
    if (typeof v === "string") {
      const n = parseInt(v, 10);
      if (!Number.isNaN(n) && n >= 0) return n;
    }
    return undefined;
  };

  return {
    title: title.slice(0, 500),
    ingredients,
    instructions,
    servings: asNumber(obj.servings),
    prepTimeMinutes: asNumber(obj.prepTimeMinutes),
    cookTimeMinutes: asNumber(obj.cookTimeMinutes),
    totalTimeMinutes: asNumber(obj.totalTimeMinutes),
    notes:
      typeof obj.notes === "string"
        ? obj.notes.trim() || undefined
        : undefined,
  };
}

/**
 * Extract recipe from image using Workers AI.
 *
 * @param ai - Workers AI binding (`env.AI`)
 * @param imageData - Raw image bytes
 * @param mimeType - image/jpeg | image/png | image/webp
 */
export async function extractRecipeFromImage(
  ai: Ai,
  imageData: ArrayBuffer,
  mimeType: string,
): Promise<ExtractedRecipeDraft> {
  const { response } = await workersAiVisionJson(
    ai,
    imageData,
    mimeType,
    RECIPE_EXTRACTION_PROMPT,
    { maxTokens: 4096, context: "recipe-from-image" },
  );
  return parseExtractedDraft(response);
}
