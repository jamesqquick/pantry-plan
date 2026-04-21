/**
 * Parse actions: extract recipe data from a URL or image.
 * Returns a draft that the UI can display for review before saving.
 */

import { defineAction } from "astro:actions";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { parseUrlSchema } from "@/features/parse/parse.schemas";
import { parseRecipeFromUrl } from "@/lib/parse/parse-recipe";
import { extractRecipeFromImageOpenAI } from "@/lib/parse/extract-recipe-from-image-openai";
import { parseIngredientLineForImport, type ParsedIngredientLine } from "@/lib/ingredients/parse-line";
import { canUseOpenAi } from "@/lib/entitlements";
import { requireUser } from "./_shared";

export type ParsedRecipeDraft = {
  title: string;
  sourceUrl: string;
  imageUrl?: string;
  servings?: number;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  totalTimeMinutes?: number;
  ingredients: string[];
  ingredientLines: ParsedIngredientLine[];
  instructions: string[];
  notes?: string;
};

export const parse = {
  /**
   * Parse recipe from a URL via JSON-LD extraction.
   * Returns a draft with raw + parsed ingredient lines.
   */
  parseFromUrl: defineAction({
    input: parseUrlSchema,
    handler: async (input, ctx): Promise<ParsedRecipeDraft> => {
      requireUser(ctx);

      const result = await parseRecipeFromUrl(input.url);
      if (!result.ok) {
        throw new Error(result.error);
      }

      const ingredientLines = result.data.ingredients.map((line) =>
        parseIngredientLineForImport(line),
      );

      return {
        title: result.data.title,
        sourceUrl: result.data.sourceUrl,
        imageUrl: result.data.imageUrl,
        servings: result.data.servings,
        prepTimeMinutes: result.data.prepTimeMinutes,
        cookTimeMinutes: result.data.cookTimeMinutes,
        totalTimeMinutes: result.data.totalTimeMinutes,
        ingredients: result.data.ingredients,
        ingredientLines,
        instructions: result.data.instructions,
        notes: result.data.notes,
      };
    },
  }),

  /**
   * Parse recipe from an uploaded image via OpenAI Vision.
   * Requires OPENAI_API_KEY secret. Accepts image as base64 string
   * (Astro actions don't support FormData natively for JSON input).
   */
  parseFromImage: defineAction({
    input: z.object({
      imageBase64: z.string().min(1, "Image data required"),
      mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    }),
    handler: async (input, ctx): Promise<ParsedRecipeDraft> => {
      requireUser(ctx);

      const apiKey = env.OPENAI_API_KEY;
      if (!canUseOpenAi(apiKey)) {
        throw new Error(
          "Recipe-from-image is not configured. Set OPENAI_API_KEY.",
        );
      }

      // Decode base64 to ArrayBuffer
      const binaryString = atob(input.imageBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const parsed = await extractRecipeFromImageOpenAI(
        bytes.buffer as ArrayBuffer,
        input.mimeType,
        apiKey,
      );

      const ingredientLines = parsed.ingredients.map((line) =>
        parseIngredientLineForImport(line),
      );

      return {
        title: parsed.title,
        sourceUrl: "",
        ingredients: parsed.ingredients,
        ingredientLines,
        instructions: parsed.instructions,
        servings: parsed.servings,
        prepTimeMinutes: parsed.prepTimeMinutes,
        cookTimeMinutes: parsed.cookTimeMinutes,
        totalTimeMinutes: parsed.totalTimeMinutes,
        notes: parsed.notes,
      };
    },
  }),
};
