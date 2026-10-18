import { formatQuantity, parseQuantityText } from "@/lib/quantity/quantity";
import { formatUnitForDisplay } from "@/lib/units";
import { UNIT_LABELS, type IngredientUnit } from "./units";

export interface IngredientLineFields {
  quantity: number | null;
  unit: IngredientUnit | null;
  displayText: string;
  ingredientName?: string | null;
}

const decimalFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 6,
  useGrouping: false,
});

export function formatIngredientQuantity(value: number, unit: IngredientUnit | null): string {
  if (!Number.isFinite(value) || value < 0) return "";
  if (unit !== "G" && unit !== "KG") {
    const fraction = formatQuantity(value, { maxDenominator: 64 });
    const represented = parseQuantityText(fraction);
    if (represented != null && (value === 0 || represented > 0) &&
      Math.abs(represented - value) <= Math.max(1e-6, value * 0.00001)) {
      return fraction;
    }
  }
  const decimal = decimalFormat.format(value);
  return value > 0 && Number(decimal) === 0 ? String(value) : decimal;
}

export function formatIngredientLine(ingredient: IngredientLineFields): string {
  const { quantity, unit } = ingredient;
  const amount = quantity == null ? "" : formatIngredientQuantity(quantity, unit);
  const unitLabel = amount && unit && unit !== "COUNT"
    ? formatUnitForDisplay(UNIT_LABELS[unit], quantity != null && quantity > 0 && quantity < 1 ? 1 : quantity)
    : "";
  const name = ingredient.displayText.trim() || ingredient.ingredientName?.trim() || "Unparsed ingredient";
  return [amount, unitLabel, name].filter(Boolean).join(" ");
}
