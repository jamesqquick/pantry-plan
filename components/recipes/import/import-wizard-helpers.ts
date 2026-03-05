import type { ParsedRecipeDraft } from "@/app/actions/parse.actions";
import type { EnhancedIngredientLineItem } from "@/app/actions/enhance-recipe-ingredients.actions";
import type { SuggestionItem } from "@/lib/ingredients/compute-suggestions";
import {
  getDisplayTextFromIngredientLine,
  parseIngredientLineStructured,
} from "@/lib/ingredients/parse-ingredient-line-structured";
import type { ParsedIngredientLine } from "@/lib/ingredients/parse-line";
import { UNIT_FROM_LABEL } from "@/lib/ingredients/units";
import { formatQuantity } from "@/lib/quantity/quantity";
import type { IngredientUnit } from "@prisma/client";
import type { StructuredItemFromParse } from "@/features/import/url-to-structured-recipe.schemas";
import type { MappingRow } from "./ingredient-mapping-table";

export type ManualFormState = {
  title: string;
  sourceUrl: string;
  imageUrl: string;
  instructions: string;
  ingredients: string;
  notes: string;
  servings: string;
  prepTimeMinutes: string;
  cookTimeMinutes: string;
  totalTimeMinutes: string;
};

export const emptyManualForm: ManualFormState = {
  title: "",
  sourceUrl: "",
  imageUrl: "",
  instructions: "",
  ingredients: "",
  notes: "",
  servings: "",
  prepTimeMinutes: "",
  cookTimeMinutes: "",
  totalTimeMinutes: "",
};

export const defaultInstruction = "";

export function createEmptyMappingRow(sortOrder: number): MappingRow {
  const id = `empty-${sortOrder}-${Date.now()}`;
  return {
    id,
    initialRawText: "",
    rawText: "",
    displayText: "",
    normalizedKey: "",
    ingredientId: "",
    ingredientName: "",
    createName: "",
    quantityText: "",
    unit: null,
    sortOrder,
    didInitQtyUnit: false,
  };
}

export function structuredItemsToRows(
  items: StructuredItemFromParse[],
): MappingRow[] {
  return items.map((item) => {
    const raw = item.rawText.trim();
    const id = `${item.sortOrder}:${raw || `line-${item.sortOrder}`}`;
    const quantityText =
      item.quantity != null && Number.isFinite(item.quantity)
        ? formatQuantity(item.quantity)
        : "";
    return {
      id,
      initialRawText: raw,
      rawText: raw,
      displayText: item.displayText,
      normalizedKey: "",
      ingredientId: item.ingredientId ?? "",
      ingredientName: item.ingredientName ?? "",
      createName: item.suggestedCreateName ?? "",
      quantityText,
      unit: item.unit,
      sortOrder: item.sortOrder,
      didInitQtyUnit: true,
    };
  });
}

export function enhancedItemsToMappingRows(
  items: EnhancedIngredientLineItem[],
): MappingRow[] {
  return items.map((item) => {
    const raw = item.rawText.trim();
    const id = `${item.sortOrder}:${raw || `line-${item.sortOrder}`}`;
    const quantityText =
      item.quantity != null && Number.isFinite(item.quantity)
        ? formatQuantity(item.quantity)
        : "";
    return {
      id,
      initialRawText: raw,
      rawText: raw,
      displayText: item.displayText,
      normalizedKey: "",
      ingredientId: item.ingredientId ?? "",
      ingredientName: item.ingredientName ?? "",
      createName: item.createName ?? "",
      quantityText,
      unit: item.unit,
      sortOrder: item.sortOrder,
      didInitQtyUnit: true,
      matchType: item.matchType,
    };
  });
}

export function suggestionsToRowsWithParsed(
  suggestions: SuggestionItem[],
  ingredientLines: ParsedIngredientLine[],
  prevRows: MappingRow[],
): MappingRow[] {
  return suggestions.map((s, i) => {
    const line = ingredientLines[i];
    const raw = (line?.raw ?? s.originalLine).trim();
    const id = `${i}:${raw || `line-${i}`}`;
    const structured = raw ? parseIngredientLineStructured(raw) : null;
    const prev = prevRows[i];
    const keepUserValues = prev && prev.id === id;
    const displayText =
      keepUserValues && prev.displayText != null
        ? prev.displayText
        : getDisplayTextFromIngredientLine(raw);
    const quantityDecimal = structured?.quantityDecimal;
    const quantityText = keepUserValues
      ? prev.quantityText
      : quantityDecimal != null && Number.isFinite(quantityDecimal)
        ? formatQuantity(quantityDecimal)
        : "";
    const unit: IngredientUnit | null = keepUserValues
      ? prev.unit
      : structured?.unit
        ? (UNIT_FROM_LABEL[structured.unit] ?? null)
        : null;
    return {
      id,
      initialRawText: raw,
      rawText: raw,
      displayText,
      normalizedKey: s.normalizedKey,
      ingredientId: s.suggestedIngredient?.id ?? "",
      ingredientName: s.suggestedIngredient?.name ?? "",
      createName: keepUserValues
        ? prev.createName
        : s.suggestedIngredient
          ? (s.suggestedCreateName ?? prev?.createName ?? "")
          : (prev?.createName ?? ""),
      quantityText,
      unit,
      sortOrder: i,
      didInitQtyUnit: true,
      matchType: s.suggestedIngredient?.matchType,
    };
  });
}

export function draftToManualForm(
  draft: ParsedRecipeDraft,
  sourceUrl?: string,
): ManualFormState {
  return {
    title: draft.title ?? "",
    sourceUrl: sourceUrl ?? draft.sourceUrl ?? "",
    imageUrl: draft.imageUrl ?? "",
    instructions: (draft.instructions ?? []).join("\n"),
    ingredients: (draft.ingredients ?? []).join("\n"),
    notes: draft.notes ?? "",
    servings: draft.servings != null ? String(draft.servings) : "",
    prepTimeMinutes:
      draft.prepTimeMinutes != null ? String(draft.prepTimeMinutes) : "",
    cookTimeMinutes:
      draft.cookTimeMinutes != null ? String(draft.cookTimeMinutes) : "",
    totalTimeMinutes:
      draft.totalTimeMinutes != null ? String(draft.totalTimeMinutes) : "",
  };
}
