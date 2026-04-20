/**
 * Full structured parse of an ingredient line: rawText → structured fields.
 * Used for import pipeline. Client-safe. Quantity is numeric only (quantityDecimal).
 */

import { parseQuantityText } from "@/lib/quantity/quantity";
import { normalizeUnit } from "@/lib/units";
import { htmlToText } from "./html-to-text";

/** Quantity prefix at start of line: mixed "1 1/2", fraction "1/3", decimal "2.25", or integer "2". */
const QUANTITY_PREFIX =
  /^(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+\.?\d*)\s*/;

/** Unit token: one word that might be a unit (cups, tbsp, teaspoon, g, etc.). */
const UNIT_WORD = /^(\S+)\s*/;

/**
 * Returns the ingredient line with quantity and unit stripped, for use as displayText.
 */
export function getDisplayTextFromIngredientLine(rawLine: string): string {
  const raw = htmlToText(rawLine).trim();
  if (!raw) return "";

  let remainder = raw;
  for (const [char, replacement] of [
    ["½", "1/2"],
    ["¼", "1/4"],
    ["¾", "3/4"],
    ["⅓", "1/3"],
    ["⅔", "2/3"],
    ["⅛", "1/8"],
    ["⅜", "3/8"],
    ["⅝", "5/8"],
    ["⅞", "7/8"],
  ] as [string, string][]) {
    remainder = remainder.split(char).join(replacement);
  }
  remainder = remainder.replace(/(\d)(\d\s*\/\s*\d)/g, "$1 $2").replace(/\s+/g, " ").trim();

  const qtyMatch = remainder.match(QUANTITY_PREFIX);
  if (qtyMatch) remainder = remainder.slice(qtyMatch[0].length).trim();

  const unitMatch = remainder.match(UNIT_WORD);
  if (unitMatch) {
    const normalized = normalizeUnit(unitMatch[1]);
    if (normalized) remainder = remainder.slice(unitMatch[0].length).trim();
  }

  return remainder.trim() || raw;
}

/** Leading descriptors to strip from name (optional, simple). */
const LEADING_DESCRIPTORS =
  /^(chopped|diced|minced|fresh|finely\s+chopped|crushed|grated|sliced|softened|melted|room\s+temperature)\s+/i;

export type ParsedIngredientLineStructured = {
  rawText: string;
  nameNormalized: string | null;
  quantityDecimal: number | null;
  unit: string | null;
  parseConfidence: number;
  parseNotes?: string;
};

/**
 * Parse a raw ingredient line into structured fields.
 * Preserves rawText; never modifies it. Invalid quantity does not crash; returns nulls.
 */
export function parseIngredientLineStructured(
  rawText: string
): ParsedIngredientLineStructured {
  const raw = htmlToText(rawText).trim();
  let confidence = 0.5;
  const notes: string[] = [];

  let remainder = raw;
  for (const [char, replacement] of [
    ["½", "1/2"],
    ["¼", "1/4"],
    ["¾", "3/4"],
    ["⅓", "1/3"],
    ["⅔", "2/3"],
    ["⅛", "1/8"],
    ["⅜", "3/8"],
    ["⅝", "5/8"],
    ["⅞", "7/8"],
  ] as [string, string][]) {
    remainder = remainder.split(char).join(replacement);
  }
  remainder = remainder.replace(/(\d)(\d\s*\/\s*\d)/g, "$1 $2").replace(/\s+/g, " ").trim();

  let quantityDecimal: number | null = null;
  let unit: string | null = null;

  const qtyMatch = remainder.match(QUANTITY_PREFIX);
  if (qtyMatch) {
    const qtyToken = qtyMatch[1].trim();
    quantityDecimal = parseQuantityText(qtyToken);
    remainder = remainder.slice(qtyMatch[0].length).trim();
    if (quantityDecimal != null) confidence += 0.2;
    else notes.push("quantity parse failed");
  }

  const unitMatch = remainder.match(UNIT_WORD);
  if (unitMatch) {
    const rawUnit = unitMatch[1];
    const normalized = normalizeUnit(rawUnit);
    if (normalized) {
      unit = normalized;
      remainder = remainder.slice(unitMatch[0].length).trim();
      confidence += 0.2;
    }
  }

  const hasQuantity = quantityDecimal != null && Number.isFinite(quantityDecimal);
  if (hasQuantity && unit == null) {
    unit = "count";
  }

  let nameNormalized: string | null = remainder
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase() || null;
  if (nameNormalized) {
    nameNormalized = nameNormalized.replace(LEADING_DESCRIPTORS, "").trim() || null;
    if (nameNormalized) confidence += 0.1;
  }

  confidence = Math.min(1, Math.max(0, confidence));

  return {
    rawText: raw,
    nameNormalized,
    quantityDecimal,
    unit,
    parseConfidence: Math.round(confidence * 1e4) / 1e4,
    parseNotes: notes.length > 0 ? notes.join("; ") : undefined,
  };
}

/** Existing structured fields (e.g. from a recipe ingredient row). */
export type ExistingStructuredFields = {
  quantity?: number | null;
  unit?: string | null;
  nameNormalized?: string | null;
  ingredientName?: string | null;
};

/** Result of merging parse output into existing fields. */
export type MergedStructuredFields = {
  quantity: number | null;
  unit: string | null;
  nameNormalized: string | null;
};

/**
 * Merge parsed line result into existing structured fields.
 * Only applies parsed values that are valid; never blanks out existing good data.
 */
export function mergeParsedIntoStructured(
  parsed: ParsedIngredientLineStructured,
  existing: ExistingStructuredFields
): MergedStructuredFields {
  const hasValidQty =
    parsed.quantityDecimal != null && Number.isFinite(parsed.quantityDecimal);
  const hasValidUnit = !!parsed.unit?.trim();
  const hasValidName = !!parsed.nameNormalized?.trim();

  return {
    quantity: hasValidQty ? parsed.quantityDecimal! : (existing.quantity ?? null),
    unit: hasValidUnit ? parsed.unit : (existing.unit ?? null),
    nameNormalized: hasValidName ? parsed.nameNormalized : (existing.nameNormalized ?? existing.ingredientName ?? null),
  };
}
