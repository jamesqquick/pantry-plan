/**
 * Parse a recipe from a URL: fetch HTML, extract JSON-LD, normalize.
 * URL must be validated with parseUrlSchema before calling (SSRF protection).
 * Output is untrusted; validate with recipe schema before saving.
 */

import { fetchHtml } from "./fetch-html";
import { extractJsonLd, findRecipeInJsonLd } from "./extract-jsonld";
import { normalizeRecipe, type NormalizedRecipe } from "./normalize-recipe";

export type { NormalizedRecipe };

export interface ParseResult {
  ok: true;
  data: NormalizedRecipe;
}

export interface ParseError {
  ok: false;
  error: string;
}

export async function parseRecipeFromUrl(
  url: string
): Promise<ParseResult | ParseError> {
  try {
    const html = await fetchHtml(url);
    const blocks = extractJsonLd(html);
    const recipeObj = findRecipeInJsonLd(blocks);
    const normalized = normalizeRecipe(recipeObj);
    if (!normalized) {
      return { ok: false, error: "No recipe found on this page" };
    }
    return {
      ok: true,
      data: {
        ...normalized,
        sourceUrl: url,
        ingredients: normalized.ingredients.length ? normalized.ingredients : [],
        instructions: normalized.instructions.length ? normalized.instructions : [],
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Parse failed";
    return { ok: false, error: message };
  }
}
