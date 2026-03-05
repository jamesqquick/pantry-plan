"use server";

import { getAuthenticatedUser } from "@/app/actions/_shared";
import { parseUrlSchema, validateRecipeImageFile } from "@/features/parse/parse.schemas";
import type { StructuredItemFromParse } from "@/features/import/url-to-structured-recipe.schemas";
import { recipeCreateSchema } from "@/features/recipes/recipes.schemas";
import { zodToFieldErrors } from "@/lib/action-helpers";
import type { ActionResult } from "@/lib/action-helpers";
import { computeIngredientSuggestions, type SuggestionItem } from "@/lib/ingredients/compute-suggestions";
import { parseIngredientLineForImport, type ParsedIngredientLine } from "@/lib/ingredients/parse-line";
import { canUseLlmForRecipeParse } from "@/lib/entitlements";
import { mapUrlDraftToStructured } from "@/lib/parse/map-url-draft-to-structured-openai";
import { extractRecipeFromImageOpenAI } from "@/lib/parse/extract-recipe-from-image-openai";
import { parseRecipeFromUrl } from "@/lib/parse/parse-recipe";

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

export type ParsedRecipeFromUrlResult = ParsedRecipeDraft & {
  structuredItems?: StructuredItemFromParse[];
  suggestions?: SuggestionItem[];
};

export async function parseRecipeFromUrlAction(
  _prev: unknown,
  formData: FormData
): Promise<ActionResult<ParsedRecipeDraft>> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;

  const parsed = parseUrlSchema.safeParse({ url: formData.get("url") });
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid URL",
        fieldErrors: zodToFieldErrors(parsed.error.issues),
      },
    };
  }
  const result = await parseRecipeFromUrl(parsed.data.url);
  if (!result.ok) {
    return {
      ok: false,
      error: { code: "PARSE_ERROR", message: result.error },
    };
  }
  const draft = {
    title: result.data.title,
    sourceUrl: result.data.sourceUrl,
    imageUrl: result.data.imageUrl,
    servings: result.data.servings,
    prepTimeMinutes: result.data.prepTimeMinutes,
    cookTimeMinutes: result.data.cookTimeMinutes,
    totalTimeMinutes: result.data.totalTimeMinutes,
    ingredients: result.data.ingredients,
    instructions: result.data.instructions,
    notes: result.data.notes,
  };
  const validated = recipeCreateSchema.safeParse(draft);
  if (!validated.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Parsed data invalid",
        fieldErrors: zodToFieldErrors(validated.error.issues),
      },
    };
  }
  const ingredientLines = validated.data.ingredients.map((line) =>
    parseIngredientLineForImport(line)
  );
  const baseDraft: ParsedRecipeDraft = {
    title: validated.data.title,
    sourceUrl: validated.data.sourceUrl ?? "",
    imageUrl: validated.data.imageUrl,
    servings: validated.data.servings,
    prepTimeMinutes: validated.data.prepTimeMinutes,
    cookTimeMinutes: validated.data.cookTimeMinutes,
    totalTimeMinutes: validated.data.totalTimeMinutes,
    ingredients: validated.data.ingredients,
    ingredientLines,
    instructions: validated.data.instructions,
    notes: validated.data.notes,
  };

  return { ok: true, data: baseDraft };
}

export async function parseRecipeFromImageAction(
  _prev: unknown,
  formData: FormData
): Promise<ActionResult<ParsedRecipeDraft>> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;

  const file = formData.get("image");
  const fileError = validateRecipeImageFile(file instanceof File ? file : null);
  if (fileError) {
    return {
      ok: false,
      error: { code: "VALIDATION_ERROR", message: fileError },
    };
  }
  const imageFile = file as File;
  let buffer: Buffer;
  try {
    const arrayBuffer = await imageFile.arrayBuffer();
    buffer = Buffer.from(arrayBuffer);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to read image";
    return { ok: false, error: { code: "PARSE_ERROR", message } };
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return {
      ok: false,
      error: {
        code: "PARSE_ERROR",
        message: "Recipe-from-image is not configured. Set OPENAI_API_KEY.",
      },
    };
  }

  let parsed: Awaited<ReturnType<typeof extractRecipeFromImageOpenAI>>;
  try {
    const mimeType = imageFile.type || "image/jpeg";
    parsed = await extractRecipeFromImageOpenAI(buffer, mimeType);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not read recipe from image.";
    return { ok: false, error: { code: "PARSE_ERROR", message } };
  }

  const draft = {
    title: parsed.title,
    sourceUrl: "",
    imageUrl: undefined,
    servings: parsed.servings,
    prepTimeMinutes: parsed.prepTimeMinutes,
    cookTimeMinutes: parsed.cookTimeMinutes,
    totalTimeMinutes: parsed.totalTimeMinutes,
    ingredients: parsed.ingredients,
    instructions: parsed.instructions,
    notes: parsed.notes,
  };
  const validated = recipeCreateSchema.safeParse(draft);
  if (!validated.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Parsed data invalid",
        fieldErrors: zodToFieldErrors(validated.error.issues),
      },
    };
  }
  const ingredientLines = validated.data.ingredients.map((line) =>
    parseIngredientLineForImport(line)
  );
  return {
    ok: true,
    data: {
      title: validated.data.title,
      sourceUrl: "",
      imageUrl: validated.data.imageUrl,
      servings: validated.data.servings,
      prepTimeMinutes: validated.data.prepTimeMinutes,
      cookTimeMinutes: validated.data.cookTimeMinutes,
      totalTimeMinutes: validated.data.totalTimeMinutes,
      ingredients: validated.data.ingredients,
      ingredientLines,
      instructions: validated.data.instructions,
      notes: validated.data.notes,
    },
  };
}
