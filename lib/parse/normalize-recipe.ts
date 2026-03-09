/**
 * Normalize untrusted JSON-LD recipe object into a plain shape.
 * Output is still untrusted; must be validated with Zod before saving.
 * Supports: title, sourceUrl, image, servings, prep/cook/total time (ISO 8601), ingredients[], instructions[] (string or HowToStep).
 */

import { htmlToText } from "../ingredients/html-to-text";
import { parseIso8601DurationToMinutes } from "./iso8601-duration";

/**
 * Split a single string that contains multiple numbered steps (e.g. "1. Do this. 2. Do that.")
 * into an array of step strings. Handles "1. ", "2) ", etc. If no numbered pattern found,
 * returns [text] so the string is kept as one step.
 */
function splitNumberedSteps(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  // Match position before "digit(s). " or "digit(s)) " (step number at start of next step)
  const parts = trimmed.split(/(?!^)(?=\d+[.)]\s)/);
  const steps = parts.map((s) => s.trim()).filter(Boolean);
  return steps.length > 0 ? steps : [trimmed];
}

function asString(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v) && v.length > 0 && typeof v[0] === "string")
    return String(v[0]).trim();
  return "";
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .map((x) => (typeof x === "string" ? x.trim() : String(x)))
      .filter(Boolean);
  }
  if (typeof v === "string")
    return v
      .split(/\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

/** Normalize instructions: support strings, HowToStep objects, or ItemList with itemListElement; return string[]. */
function asInstructionArray(v: unknown): string[] {
  // Unwrap schema.org ItemList: recipeInstructions can be { itemListElement: HowToStep[] }
  let arr: unknown[] | null = null;
  if (Array.isArray(v)) {
    arr = v;
  } else if (
    v &&
    typeof v === "object" &&
    "itemListElement" in v &&
    Array.isArray((v as { itemListElement: unknown }).itemListElement)
  ) {
    arr = (v as { itemListElement: unknown[] }).itemListElement;
  }
  if (arr) {
    return arr
      .flatMap((step: unknown) => {
        let stepText: string;
        if (typeof step === "string") stepText = htmlToText(step).trim();
        else if (step && typeof step === "object") {
          const obj = step as Record<string, unknown>;
          const target =
            "item" in obj && obj.item != null
              ? (obj.item as Record<string, unknown>)
              : obj;
          const text =
            target.text ??
            target.name ??
            target.description ??
            obj.text ??
            obj.name ??
            obj.description;
          stepText =
            text != null && typeof text === "string"
              ? htmlToText(text).trim()
              : htmlToText(String(step)).trim();
        } else {
          stepText = htmlToText(String(step)).trim();
        }
        if (!stepText) return [];
        return splitNumberedSteps(stepText);
      })
      .filter(Boolean);
  }
  if (typeof v === "string") {
    const byNewline = v
      .split(/\n/)
      .map((s) => htmlToText(s).trim())
      .filter(Boolean);
    return byNewline.flatMap((s) => splitNumberedSteps(s));
  }
  return [];
}

function asPositiveInt(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isInteger(v) && v >= 0) return v;
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    if (!Number.isNaN(n) && n >= 0) return n;
  }
  return undefined;
}

export interface NormalizedRecipe {
  title: string;
  sourceUrl: string;
  imageUrl?: string;
  servings?: number;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  totalTimeMinutes?: number;
  ingredients: string[];
  instructions: string[];
  notes?: string;
}

export function normalizeRecipe(
  obj: Record<string, unknown> | null,
): NormalizedRecipe | null {
  if (!obj || typeof obj !== "object") return null;
  const title = asString(obj.name ?? obj.title);
  if (!title) return null;

  const ingredients = asStringArray(obj.recipeIngredient ?? obj.ingredients);
  const instructions = asInstructionArray(obj.recipeInstructions);

  const image = obj.image;
  let imageUrl: string | undefined;
  if (typeof image === "string") imageUrl = image.trim() || undefined;
  else if (
    Array.isArray(image) &&
    image.length > 0 &&
    typeof image[0] === "string"
  )
    imageUrl = image[0].trim() || undefined;
  else if (image && typeof image === "object" && "url" in image)
    imageUrl = String((image as { url: string }).url).trim() || undefined;

  const prepTimeMinutes =
    parseIso8601DurationToMinutes(obj.prepTime) ??
    asPositiveInt(obj.prepTimeMinutes);
  const cookTimeMinutes =
    parseIso8601DurationToMinutes(obj.cookTime) ??
    asPositiveInt(obj.cookTimeMinutes);
  const totalTimeMinutes =
    parseIso8601DurationToMinutes(obj.totalTime) ??
    asPositiveInt(obj.totalTimeMinutes) ??
    (prepTimeMinutes !== undefined && cookTimeMinutes !== undefined
      ? prepTimeMinutes + cookTimeMinutes
      : undefined);

  return {
    title,
    sourceUrl: "",
    imageUrl,
    servings: asPositiveInt(obj.recipeYield ?? obj.servings ?? obj.yield),
    prepTimeMinutes,
    cookTimeMinutes,
    totalTimeMinutes,
    ingredients: ingredients.length ? ingredients : [],
    instructions,
    notes: asString(obj.notes ?? obj.recipeNotes) || undefined,
  };
}
