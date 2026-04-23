/**
 * Extract recipe from an image — Workers AI primary, OpenAI fallback.
 *
 * Flow:
 *   1. Try Llama 4 Scout via Workers AI binding (vision + JSON mode)
 *   2. If Workers AI fails and OPENAI_API_KEY is set, fall back to OpenAI gpt-4o-mini
 *   3. If both fail, throw the Workers AI error
 *
 * Reuses the same ExtractedRecipeDraft type as the OpenAI-only module so
 * callers don't need to change.
 */

import {
  workersAiVisionJson,
} from "./workers-ai-client";
import {
  extractRecipeFromImageOpenAI,
  type ExtractedRecipeDraft,
} from "@/lib/parse/extract-recipe-from-image-openai";
import { canUseOpenAi } from "@/lib/entitlements";

export type { ExtractedRecipeDraft };

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
 * Extract recipe from image, Workers AI first, OpenAI fallback.
 *
 * @param ai - Workers AI binding (`env.AI`)
 * @param imageData - Raw image bytes
 * @param mimeType - image/jpeg | image/png | image/webp
 * @param openaiApiKey - Optional OpenAI key for fallback
 */
export async function extractRecipeFromImage(
  ai: Ai,
  imageData: ArrayBuffer,
  mimeType: string,
  openaiApiKey?: string | null,
): Promise<ExtractedRecipeDraft> {
  // --- Workers AI primary ---
  let workersAiError: Error | null = null;
  try {
    const { response } = await workersAiVisionJson(
      ai,
      imageData,
      mimeType,
      RECIPE_EXTRACTION_PROMPT,
      { maxTokens: 4096, context: "recipe-from-image" },
    );
    return parseExtractedDraft(response);
  } catch (err) {
    workersAiError =
      err instanceof Error ? err : new Error("Workers AI vision failed");
    console.warn(
      `[AI] Workers AI image extraction failed, will attempt fallback: ${workersAiError.message}`,
    );
  }

  // --- OpenAI fallback ---
  if (canUseOpenAi(openaiApiKey)) {
    console.info("[AI] Falling back to OpenAI for image extraction.");
    return extractRecipeFromImageOpenAI(imageData, mimeType, openaiApiKey!);
  }

  // No fallback available — surface the Workers AI error
  throw workersAiError;
}
