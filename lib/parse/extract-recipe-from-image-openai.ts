/**
 * Extract recipe from an image using OpenAI Vision API.
 * Caller must validate image (type, size) and auth. Output is untrusted; validate with recipeCreateSchema.
 */

import OpenAI from "openai";
import { logLlmRequest } from "@/lib/log-llm";

/** Shape returned by the extractor; matches draft input to recipeCreateSchema. */
export interface ExtractedRecipeDraft {
  title: string;
  ingredients: string[];
  instructions: string[];
  servings?: number;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  totalTimeMinutes?: number;
  notes?: string;
}

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

/**
 * Extract recipe structure from an image buffer using OpenAI Vision.
 * @param buffer - Image file content (caller validates type and size).
 * @param mimeType - Image MIME type (e.g. image/jpeg, image/png, image/webp) for the data URL.
 */
export async function extractRecipeFromImageOpenAI(
  buffer: Buffer,
  mimeType: string
): Promise<ExtractedRecipeDraft> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Recipe-from-image is not configured. Set OPENAI_API_KEY.");
  }

  const base64 = buffer.toString("base64");
  const imageUrl = `data:${mimeType};base64,${base64}`;

  const openai = new OpenAI({ apiKey });
  const startTime = Date.now();
  const model = "gpt-4o-mini";

  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: RECIPE_EXTRACTION_PROMPT },
            {
              type: "image_url",
              image_url: { url: imageUrl },
            },
          ],
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 4096,
    });

    const rawContent = completion.choices[0]?.message?.content;
    if (!rawContent || typeof rawContent !== "string") {
      throw new Error("No recipe content returned from image.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawContent) as unknown;
    } catch {
      throw new Error("Could not parse recipe from image.");
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Invalid recipe format from image.");
    }

    const obj = parsed as Record<string, unknown>;
    const title = typeof obj.title === "string" ? obj.title.trim() : "";
    const ingredients = Array.isArray(obj.ingredients)
      ? (obj.ingredients as unknown[]).map((x) => (typeof x === "string" ? x.trim() : String(x))).filter(Boolean)
      : [];
    const instructions = Array.isArray(obj.instructions)
      ? (obj.instructions as unknown[]).map((x) => (typeof x === "string" ? x.trim() : String(x))).filter(Boolean)
      : [];

    if (!title) throw new Error("Could not read recipe title from image.");
    if (instructions.length === 0) throw new Error("Could not read recipe instructions from image.");

    const asNumber = (v: unknown): number | undefined => {
      if (typeof v === "number" && Number.isInteger(v) && v >= 0) return v;
      if (typeof v === "string") {
        const n = parseInt(v, 10);
        if (!Number.isNaN(n) && n >= 0) return n;
      }
      return undefined;
    };

    const durationMs = Date.now() - startTime;
    logLlmRequest({
      context: "recipe-from-image",
      model,
      success: true,
      durationMs,
      usage: completion.usage ?? undefined,
    });

    return {
      title: title.slice(0, 500),
      ingredients,
      instructions,
      servings: asNumber(obj.servings),
      prepTimeMinutes: asNumber(obj.prepTimeMinutes),
      cookTimeMinutes: asNumber(obj.cookTimeMinutes),
      totalTimeMinutes: asNumber(obj.totalTimeMinutes),
      notes: typeof obj.notes === "string" ? obj.notes.trim() || undefined : undefined,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    logLlmRequest({
      context: "recipe-from-image",
      model,
      success: false,
      durationMs,
      errorMessage: err instanceof Error ? err.message : "Unknown error",
    });
    throw err;
  }
}
