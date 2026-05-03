/**
 * Parse actions: extract recipe data from a URL or image.
 * Returns a draft that the UI can display for review before saving.
 *
 * Image extraction uses Workers AI (Gemma 3 12B vision).
 * URL parsing remains deterministic (JSON-LD).
 */

import { ActionError, defineAction } from "astro:actions";
import { env } from "cloudflare:workers";
import { z } from "zod";
import {
  ALLOWED_RECIPE_IMAGE_TYPES,
  MAX_RECIPE_IMAGE_BYTES,
  parseUrlSchema,
} from "@/features/parse/parse.schemas";
import { parseRecipeFromUrl } from "@/lib/parse/parse-recipe";
import { extractRecipeFromImage } from "@/lib/ai/extract-recipe-from-image";
import { parseIngredientLineForImport, type ParsedIngredientLine } from "@/lib/ingredients/parse-line";
import { canUseWorkersAi } from "@/lib/entitlements";
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
        throw new ActionError({
          code: "BAD_REQUEST",
          message: result.error,
        });
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
   * Parse recipe from an uploaded image via Workers AI (Gemma 3 12B vision).
   *
   * Accepts the image as a real File via multipart/form-data (accept: "form").
   * This avoids ~33% base64 inflation, double encode/decode passes, and the
   * need to raise Astro's actionBodySizeLimit beyond a small headroom value.
   */
  parseFromImage: defineAction({
    accept: "form",
    input: z.object({
      image: z
        .instanceof(File, { message: "Image file is required." })
        .refine(
          (f) => f.size > 0 && f.size <= MAX_RECIPE_IMAGE_BYTES,
          "Image must be 4 MB or smaller.",
        )
        .refine(
          (f) =>
            (
              ALLOWED_RECIPE_IMAGE_TYPES as readonly string[]
            ).includes(f.type),
          "Image must be JPEG, PNG, or WebP.",
        ),
    }),
    handler: async (input, ctx): Promise<ParsedRecipeDraft> => {
      requireUser(ctx);

      const ai = env.AI;
      if (!canUseWorkersAi(ai)) {
        throw new ActionError({
          code: "SERVICE_UNAVAILABLE",
          message:
            "Recipe-from-image is not configured. Workers AI binding not available.",
        });
      }

      const buffer = await input.image.arrayBuffer();
      const parsed = await extractRecipeFromImage(
        ai,
        buffer,
        input.image.type,
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
