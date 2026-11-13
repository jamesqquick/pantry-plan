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
import { suggestIngredientMappings } from "@/lib/ingredients/suggest-ingredient-mappings";
import { canUseWorkersAi } from "@/lib/entitlements";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getBooleanFlag } from "@/lib/feature-flags";
import { getDb, requireUser } from "./_shared";

type ImportedIngredientLine = ParsedIngredientLine & {
  ingredientId?: string;
  ingredientName?: string;
  createName?: string;
};

export type ParsedRecipeDraft = {
  title: string;
  sourceUrl: string;
  imageUrl?: string;
  servings?: number;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  totalTimeMinutes?: number;
  ingredients: string[];
  ingredientLines: ImportedIngredientLine[];
  instructions: string[];
  notes?: string;
};

async function parseAndMatchIngredientLines(
  lines: string[],
  userId: string,
): Promise<ImportedIngredientLine[]> {
  const parsedLines = lines.map(parseIngredientLineForImport);
  if (!lines.some((line) => line.trim())) return parsedLines;

  try {
    const { suggestions } = await suggestIngredientMappings(getDb(), lines, userId, env.AI);
    return parsedLines.map((line, index) => ({
      ...line,
      ingredientId: suggestions[index]?.suggestedIngredient?.id,
      ingredientName: suggestions[index]?.suggestedIngredient?.name,
      createName: suggestions[index]?.suggestedCreateName?.trim() || undefined,
    }));
  } catch {
    return parsedLines;
  }
}

export const parse = {
  /**
   * Parse recipe from a URL via JSON-LD extraction.
   * Returns a draft with raw + parsed ingredient lines.
   */
  parseFromUrl: defineAction({
    input: parseUrlSchema,
    handler: async (input, ctx): Promise<ParsedRecipeDraft> => {
      const user = requireUser(ctx);

      // Throttle AI-backed parsing per user. Shared budget with
      // parseFromImage — both keys are `ai:<userId>` — so a user gets
      // 5 AI parses per 60s regardless of which entry point they use.
      await enforceRateLimit(env.AI_RATE_LIMIT, `ai:${user.id}`);

      const result = await parseRecipeFromUrl(input.url);
      if (!result.ok) {
        throw new ActionError({
          code: "BAD_REQUEST",
          message: result.error,
        });
      }

      const ingredientLines = await parseAndMatchIngredientLines(result.data.ingredients, user.id);

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
      const user = requireUser(ctx);

      // Shared rate limit with parseFromUrl: 5 AI parses per 60s per user.
      await enforceRateLimit(env.AI_RATE_LIMIT, `ai:${user.id}`);

      // Gate image upload behind a Flagship feature flag.
      const imageUploadEnabled = await getBooleanFlag(
        env.FLAGS,
        "recipe-image-upload",
        false,
        { email: user.email, userId: user.id },
      );
      if (!imageUploadEnabled) {
        throw new ActionError({
          code: "FORBIDDEN",
          message: "Recipe-from-image is not available for your account yet.",
        });
      }

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

      const ingredientLines = await parseAndMatchIngredientLines(parsed.ingredients, user.id);

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
