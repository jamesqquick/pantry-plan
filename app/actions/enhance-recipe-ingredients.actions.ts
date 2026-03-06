"use server";

import type { IngredientUnit } from "@/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { getAuthenticatedUser } from "@/app/actions/_shared";
import { zodToFieldErrors } from "@/lib/action-helpers";
import type { ActionResult } from "@/lib/action-helpers";
import { recipeIdOnlySchema } from "@/features/recipes/recipe-ingredients.schemas";
import { suggestMappingsSchema } from "@/features/import/import.schemas";
import { normalizeIngredientName } from "@/lib/ingredients/normalize";
import { UNIT_FROM_LABEL } from "@/lib/ingredients/units";
import {
  parseIngredientLineStructured,
  getDisplayTextFromIngredientLine,
} from "@/lib/ingredients/parse-ingredient-line-structured";
import {
  computeIngredientSuggestions,
  type SuggestionItem,
} from "@/lib/ingredients/compute-suggestions";
import { suggestMappingsWithLLM } from "@/lib/ingredients/llm-ingredient-mapping";

const FUZZY_THRESHOLD_LLM_CANDIDATES = 0.1;
const MAX_LLM_CANDIDATES_PER_LINE = 20;
const LLM_CATALOG_FALLBACK_SIZE = 100;

export type EnhancedRecipeIngredientResult = {
  ingredientId: string | null;
  ingredientName: string;
  quantity: number | null;
  unit: IngredientUnit | null;
  displayText: string;
  rawText: string | null;
  sortOrder: number;
};

export async function enhanceRecipeIngredientsAction(
  _prev: unknown,
  formData: FormData
): Promise<ActionResult<{ items: EnhancedRecipeIngredientResult[] }>> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;
  const user = userResult.data;

  const recipeIdRaw = formData.get("recipeId");
  const parsed = recipeIdOnlySchema.safeParse({ recipeId: recipeIdRaw });
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input",
        fieldErrors: zodToFieldErrors(parsed.error.issues),
      },
    };
  }

  const db = getDb();
  const recipe = await db.recipe.findFirst({
    where: { id: parsed.data.recipeId, userId: user.id },
    include: {
      recipeIngredients: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!recipe) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Recipe not found." } };
  }

  const lines = recipe.recipeIngredients.map(
    (ri) => (ri.rawText ?? ri.displayText ?? "").trim() || ri.displayText
  );
  if (lines.length === 0) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "Recipe has no ingredient lines." } };
  }

  let suggestions: SuggestionItem[] = await computeIngredientSuggestions(lines, user.id);

  const userScope = { OR: [{ userId: null }, { userId: user.id }] };
  const candidateIds = new Set<string>();
  for (let i = 0; i < suggestions.length; i++) {
    const item = suggestions[i]!;
    if (item.suggestedIngredient || !item.normalizedKey.trim()) continue;
    const topForLlm = (item.candidates ?? [])
      .filter((c) => (c.score ?? 0) >= FUZZY_THRESHOLD_LLM_CANDIDATES)
      .slice(0, MAX_LLM_CANDIDATES_PER_LINE);
    for (const c of topForLlm) candidateIds.add(c.id);
  }

  const unmapped = suggestions
    .map((s, i) => ({ originalIndex: i, text: s.originalLine }))
    .filter(
      (_, i) =>
        !suggestions[i]!.suggestedIngredient &&
        suggestions[i]!.normalizedKey.trim() !== ""
    );

  if (unmapped.length > 0 && process.env.OPENAI_API_KEY?.trim()) {
    let catalogForLlm: { id: string; normalizedName: string; name: string }[];
    if (candidateIds.size > 0) {
      catalogForLlm = await db.ingredient.findMany({
        where: { id: { in: Array.from(candidateIds) } },
        select: { id: true, normalizedName: true, name: true },
      });
    } else {
      catalogForLlm = await db.ingredient.findMany({
        where: userScope,
        select: { id: true, normalizedName: true, name: true },
        take: LLM_CATALOG_FALLBACK_SIZE,
        orderBy: { name: "asc" },
      });
    }
    if (catalogForLlm.length === 0) {
      catalogForLlm = await db.ingredient.findMany({
        where: userScope,
        select: { id: true, normalizedName: true, name: true },
        take: LLM_CATALOG_FALLBACK_SIZE,
        orderBy: { name: "asc" },
      });
    }
    const llmSuggestions = await suggestMappingsWithLLM(unmapped, catalogForLlm);
    const llmIngredientIds = new Set<string>();
    for (const [, suggestion] of llmSuggestions) {
      if ("ingredientId" in suggestion) llmIngredientIds.add(suggestion.ingredientId);
    }
    const idToIngredient = new Map<
      string,
      { id: string; name: string; normalizedName: string }
    >();
    if (llmIngredientIds.size > 0) {
      const llmIngredients = await db.ingredient.findMany({
        where: { id: { in: Array.from(llmIngredientIds) } },
        select: { id: true, name: true, normalizedName: true },
      });
      for (const ing of llmIngredients) idToIngredient.set(ing.id, ing);
    }
    for (const [originalIndex, suggestion] of llmSuggestions) {
      const item = suggestions[originalIndex];
      if (!item) continue;
      if ("ingredientId" in suggestion) {
        const ing = idToIngredient.get(suggestion.ingredientId);
        if (ing) {
          item.suggestedIngredient = {
            id: ing.id,
            name: ing.name,
            normalizedName: ing.normalizedName,
            matchType: "llm",
          };
        }
      } else {
        item.suggestedCreateName = suggestion.createName;
      }
    }
  }

  let data: { items: EnhancedRecipeIngredientResult[] };
  try {
    data = await db.$transaction(async (tx) => {
      await tx.recipeIngredient.deleteMany({
        where: { recipeId: recipe.id },
      });

      const createData: Array<{
        recipeId: string;
        ingredientId: string | null;
        quantity: number | null;
        unit: IngredientUnit | null;
        displayText: string;
        rawText: string | null;
        sortOrder: number;
      }> = [];
      const returnItems: EnhancedRecipeIngredientResult[] = [];

      for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i]!;
        const suggestion = suggestions[i]!;
        const structured = parseIngredientLineStructured(rawLine);
        const quantity =
          structured.quantityDecimal != null && Number.isFinite(structured.quantityDecimal)
            ? structured.quantityDecimal
            : null;
        const unit = structured.unit
          ? UNIT_FROM_LABEL[structured.unit] ?? null
          : null;
        const displayText =
          getDisplayTextFromIngredientLine(rawLine).trim() || rawLine.trim() || "—";

        let ingredientId: string | null = null;
        let ingredientName = "";
        if (suggestion.suggestedIngredient) {
          ingredientId = suggestion.suggestedIngredient.id;
          ingredientName = suggestion.suggestedIngredient.name;
        } else if (suggestion.suggestedCreateName?.trim()) {
          const createName = suggestion.suggestedCreateName.trim();
          ingredientName = createName;
          const normalizedName = normalizeIngredientName(createName);
          const existing = await tx.ingredient.findFirst({
            where: {
              OR: [
                { userId: null, normalizedName },
                { userId: user.id, normalizedName },
              ],
            },
          });
          if (existing) {
            ingredientId = existing.id;
            ingredientName = existing.name;
          } else {
            const created = await tx.ingredient.create({
              data: {
                userId: user.id,
                name: createName,
                normalizedName,
                costBasisUnit: "GRAM",
              },
            });
            ingredientId = created.id;
          }
          const aliasNorm =
            normalizeIngredientName(rawLine.trim()).trim() ||
            normalizeIngredientName(createName).trim();
          if (aliasNorm) {
            await tx.ingredientAlias.upsert({
              where: { aliasNormalized: aliasNorm },
              create: { ingredientId, aliasNormalized: aliasNorm },
              update: { ingredientId },
            });
          }
        }

        createData.push({
          recipeId: recipe.id,
          ingredientId,
          quantity,
          unit,
          displayText,
          rawText: rawLine.trim() || null,
          sortOrder: i,
        });
        returnItems.push({
          ingredientId,
          ingredientName,
          quantity,
          unit,
          displayText,
          rawText: rawLine.trim() || null,
          sortOrder: i,
        });
      }

      if (createData.length > 0) {
        await tx.recipeIngredient.createMany({
          data: createData,
        });
      }

      return { items: returnItems };
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Transaction failed";
    if (msg === "FORBIDDEN") {
      return {
        ok: false,
        error: {
          code: "FORBIDDEN",
          message: "An ingredient was not found or does not belong to you.",
        },
      };
    }
    console.error("enhanceRecipeIngredientsAction", err);
    return {
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "Failed to enhance ingredients." },
    };
  }

  revalidatePath("/recipes");
  revalidatePath(`/recipes/${recipe.id}`);
  revalidatePath(`/recipes/${recipe.id}/edit`);
  return { ok: true, data };
}

export type EnhancedIngredientLineItem = {
  rawText: string;
  displayText: string;
  quantity: number | null;
  unit: IngredientUnit | null;
  ingredientId: string;
  ingredientName: string;
  createName: string;
  sortOrder: number;
  matchType?: "exact" | "alias" | "fuzzy" | "llm";
};

export async function enhanceIngredientLinesAction(
  _prev: unknown,
  formData: FormData
): Promise<
  ActionResult<{ items: EnhancedIngredientLineItem[] }>
> {
  const userResult = await getAuthenticatedUser();
  if (!userResult.ok) return userResult;
  const user = userResult.data;

  const linesRaw = formData.get("lines");
  if (typeof linesRaw !== "string" || !linesRaw.trim()) {
    return {
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Lines are required." },
    };
  }
  let lines: string[];
  try {
    const parsed = JSON.parse(linesRaw) as unknown;
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    const validated = suggestMappingsSchema.safeParse({ lines: arr });
    if (!validated.success) {
      return {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid lines",
          fieldErrors: zodToFieldErrors(validated.error.issues),
        },
      };
    }
    lines = validated.data.lines;
  } catch {
    return {
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid lines format." },
    };
  }

  if (lines.length === 0) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "At least one ingredient line is required." } };
  }

  const db = getDb();
  let suggestions: SuggestionItem[] = await computeIngredientSuggestions(lines, user.id);

  const userScope = { OR: [{ userId: null }, { userId: user.id }] };
  const candidateIds = new Set<string>();
  for (let i = 0; i < suggestions.length; i++) {
    const item = suggestions[i]!;
    if (item.suggestedIngredient || !item.normalizedKey.trim()) continue;
    const topForLlm = (item.candidates ?? [])
      .filter((c) => (c.score ?? 0) >= FUZZY_THRESHOLD_LLM_CANDIDATES)
      .slice(0, MAX_LLM_CANDIDATES_PER_LINE);
    for (const c of topForLlm) candidateIds.add(c.id);
  }

  const unmapped = suggestions
    .map((s, i) => ({ originalIndex: i, text: s.originalLine }))
    .filter(
      (_, i) =>
        !suggestions[i]!.suggestedIngredient &&
        suggestions[i]!.normalizedKey.trim() !== ""
    );

  if (unmapped.length > 0 && process.env.OPENAI_API_KEY?.trim()) {
    let catalogForLlm: { id: string; normalizedName: string; name: string }[];
    if (candidateIds.size > 0) {
      catalogForLlm = await db.ingredient.findMany({
        where: { id: { in: Array.from(candidateIds) } },
        select: { id: true, normalizedName: true, name: true },
      });
    } else {
      catalogForLlm = await db.ingredient.findMany({
        where: userScope,
        select: { id: true, normalizedName: true, name: true },
        take: LLM_CATALOG_FALLBACK_SIZE,
        orderBy: { name: "asc" },
      });
    }
    if (catalogForLlm.length === 0) {
      catalogForLlm = await db.ingredient.findMany({
        where: userScope,
        select: { id: true, normalizedName: true, name: true },
        take: LLM_CATALOG_FALLBACK_SIZE,
        orderBy: { name: "asc" },
      });
    }
    const llmSuggestions = await suggestMappingsWithLLM(unmapped, catalogForLlm);
    const llmIngredientIds = new Set<string>();
    for (const [, suggestion] of llmSuggestions) {
      if ("ingredientId" in suggestion) llmIngredientIds.add(suggestion.ingredientId);
    }
    const idToIngredient = new Map<
      string,
      { id: string; name: string; normalizedName: string }
    >();
    if (llmIngredientIds.size > 0) {
      const llmIngredients = await db.ingredient.findMany({
        where: { id: { in: Array.from(llmIngredientIds) } },
        select: { id: true, name: true, normalizedName: true },
      });
      for (const ing of llmIngredients) idToIngredient.set(ing.id, ing);
    }
    for (const [originalIndex, suggestion] of llmSuggestions) {
      const item = suggestions[originalIndex];
      if (!item) continue;
      if ("ingredientId" in suggestion) {
        const ing = idToIngredient.get(suggestion.ingredientId);
        if (ing) {
          item.suggestedIngredient = {
            id: ing.id,
            name: ing.name,
            normalizedName: ing.normalizedName,
            matchType: "llm",
          };
        }
      } else {
        item.suggestedCreateName = suggestion.createName;
      }
    }
  }

  const items: EnhancedIngredientLineItem[] = [];
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]!;
    const suggestion = suggestions[i]!;
    const structured = parseIngredientLineStructured(rawLine);
    const quantity =
      structured.quantityDecimal != null && Number.isFinite(structured.quantityDecimal)
        ? structured.quantityDecimal
        : null;
    const unit = structured.unit
      ? UNIT_FROM_LABEL[structured.unit] ?? null
      : null;
    const displayText =
      getDisplayTextFromIngredientLine(rawLine).trim() || rawLine.trim() || "—";

    let ingredientId = "";
    let ingredientName = "";
    let createName = "";
    let matchType: "exact" | "alias" | "fuzzy" | "llm" | undefined;
    if (suggestion.suggestedIngredient) {
      ingredientId = suggestion.suggestedIngredient.id;
      ingredientName = suggestion.suggestedIngredient.name;
      matchType = suggestion.suggestedIngredient.matchType;
    } else if (suggestion.suggestedCreateName?.trim()) {
      createName = suggestion.suggestedCreateName.trim();
    }

    items.push({
      rawText: rawLine.trim() || rawLine,
      displayText,
      quantity,
      unit,
      ingredientId,
      ingredientName,
      createName,
      sortOrder: i,
      matchType,
    });
  }

  return { ok: true, data: { items } };
}
