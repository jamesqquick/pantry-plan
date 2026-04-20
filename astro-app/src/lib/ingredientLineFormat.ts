/**
 * Format an ingredient line for display from structured fields only.
 * Never uses rawText on the recipe details page.
 */

import { formatQuantity } from "@/lib/quantity/quantity";
import { formatUnitForDisplay } from "@/lib/units";

export type IngredientLineItemForFormat = {
  quantity: number | null;
  unit: string | null;
  nameNormalized: string | null;
  /** Fallback when nameNormalized is empty (e.g. mapped ingredient name). */
  ingredientName?: string | null;
};

/**
 * Compose display line from structured fields: [quantity] [unit] [name].
 * Quantity is always displayed as a fraction via formatQuantity.
 */
export function formatIngredientLine(item: IngredientLineItemForFormat): string {
  const quantityDisplay =
    item.quantity != null && Number.isFinite(item.quantity)
      ? formatQuantity(item.quantity)
      : "";
  const unitDisplay = formatUnitForDisplay(item.unit, item.quantity ?? null);
  const name = (item.nameNormalized?.trim() || item.ingredientName?.trim() || null) || null;

  if (!name) return "Unparsed ingredient";

  const parts: string[] = [];
  if (quantityDisplay) parts.push(quantityDisplay);
  if (unitDisplay) parts.push(unitDisplay);
  parts.push(name);
  return parts.join(" ");
}

/** Alias for "Reset from structured": build display line from quantity, unit, and name only. */
export function formatIngredientLineFromStructured(item: IngredientLineItemForFormat): string {
  return formatIngredientLine(item);
}
