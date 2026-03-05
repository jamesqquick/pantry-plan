import type { Unit } from "./units";
import { normalizeIngredientName } from "@/lib/ingredients/normalize";
import type { ParsedLine } from "./parse-ingredient-line";

export type GroceryEntry = {
  normalizedName: string;
  displayName: string;
  qty?: number;
  unit?: Unit;
  sources?: { recipeTitle: string; line: string }[];
};

/**
 * Aggregate parsed lines by normalizedName + unit.
 * If unit mismatch, keep separate entries. Sources collected when provided.
 */
export function aggregateGroceryList(
  items: { line: ParsedLine; recipeTitle?: string }[]
): GroceryEntry[] {
  const byKey = new Map<string, GroceryEntry>();

  for (const { line, recipeTitle } of items) {
    const normalizedName = normalizeIngredientName(line.name);
    if (!normalizedName) continue;
    const key = `${normalizedName}|${line.unit ?? "COUNT"}`;
    const existing = byKey.get(key);
    if (existing) {
      if (existing.qty != null && line.qty != null && existing.unit === line.unit) {
        existing.qty += line.qty;
      }
      if (recipeTitle && existing.sources) {
        existing.sources.push({ recipeTitle, line: line.original });
      }
    } else {
      byKey.set(key, {
        normalizedName,
        displayName: line.name,
        qty: line.qty,
        unit: line.unit,
        sources: recipeTitle
          ? [{ recipeTitle, line: line.original }]
          : undefined,
      });
    }
  }

  return Array.from(byKey.values());
}
