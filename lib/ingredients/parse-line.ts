import type { IngredientUnit } from "@prisma/client";
import { formatQuantity } from "@/lib/quantity/quantity";
import { parseIngredientLine } from "./parse-ingredient-line";

export type ParsedIngredientLine = {
  /** Full raw ingredient line exactly as received (before stripping qty/unit). Used so users can verify parsed data. */
  raw: string;
  parsed: {
    quantity: number | null;
    unit: IngredientUnit | null;
    name: string | null;
    /** Matched quantity substring when present (e.g. "1 1/2", "1/3") for UI init */
    quantitySource?: string;
  };
  parsedText: string;
};

/**
 * Best-effort parse of one ingredient line (supports fractions, mixed numbers, unicode ½ ⅓ etc).
 * Uses parseIngredientLine under the hood.
 * Preserves the full input as .raw (no stripping); .parsed has quantity, unit, name for mapping/display.
 */
export function parseIngredientLineForImport(line: string): ParsedIngredientLine {
  const raw = line.trim();
  const { quantityText, quantity, unit, name } = parseIngredientLine(raw);
  const parts: string[] = [];
  if (quantity != null) parts.push(String(quantity));
  if (unit) parts.push(unit);
  if (name) parts.push(name);
  const parsedText = parts.length > 0 ? parts.join(" ") : "—";
  return {
    raw,
    parsed: {
      quantity,
      unit,
      name: name || null,
      quantitySource: quantityText ?? undefined,
    },
    parsedText,
  };
}

/**
 * Lightweight parse: quantity + unit + quantityText. Safe for client (no server imports).
 * Use for initializing ingredient mapping row quantity/unit/quantityText from rawText.
 */
export function parseIngredientQuantityUnit(line: string): {
  quantity: number | null;
  unit: IngredientUnit | null;
  quantityText: string;
} {
  const { quantityText, quantity, unit } = parseIngredientLine(line);
  return {
    quantity,
    unit,
    quantityText: quantityText ?? (quantity != null ? formatQuantity(quantity) : ""),
  };
}
