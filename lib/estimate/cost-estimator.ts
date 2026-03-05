import type { GroceryEntry } from "./aggregate-grocery-list";
import type { Unit } from "./units";
import { toBasisQuantity, toCups } from "./basis-units";

export type IngredientCostInfo = {
  costBasisUnit: "GRAM" | "CUP" | "EACH";
  estimatedCentsPerBasisUnit: number | null;
  gramsPerCup?: number | null;
  cupsPerEach?: number | null;
};

export type LineEstimate = {
  normalizedName: string;
  displayName: string;
  qty?: number;
  unit?: Unit;
  estimatedCents: number;
};

export type CostEstimateResult = {
  totalCents: number;
  lines: LineEstimate[];
  missing: { normalizedName: string; reason: "NO_COST" | "UNKNOWN_CONVERSION" }[];
};

/**
 * Estimate cost from aggregated grocery list and ingredient cost map (basis-unit model).
 * Volume basis is CUP only; no ml.
 */
export function estimateCost(
  groceryList: GroceryEntry[],
  costMap: Map<string, IngredientCostInfo>
): CostEstimateResult {
  const lines: LineEstimate[] = [];
  const missing: CostEstimateResult["missing"] = [];
  let totalCents = 0;

  for (const entry of groceryList) {
    const info = costMap.get(entry.normalizedName);
    if (!info) {
      missing.push({ normalizedName: entry.normalizedName, reason: "NO_COST" });
      lines.push({
        normalizedName: entry.normalizedName,
        displayName: entry.displayName,
        qty: entry.qty,
        unit: entry.unit,
        estimatedCents: 0,
      });
      continue;
    }
    if (info.estimatedCentsPerBasisUnit == null) {
      missing.push({ normalizedName: entry.normalizedName, reason: "NO_COST" });
      lines.push({
        normalizedName: entry.normalizedName,
        displayName: entry.displayName,
        qty: entry.qty,
        unit: entry.unit,
        estimatedCents: 0,
      });
      continue;
    }
    let basisQty = toBasisQuantity(
      { quantity: entry.qty ?? 1, unit: entry.unit ?? "COUNT" },
      info.costBasisUnit
    );
    if (basisQty == null && info.costBasisUnit === "GRAM" && info.gramsPerCup != null) {
      const cups = toCups(entry.qty ?? 1, entry.unit ?? "COUNT");
      if (cups != null) {
        basisQty = cups * info.gramsPerCup;
      }
    }
    if (basisQty == null) {
      missing.push({
        normalizedName: entry.normalizedName,
        reason: "UNKNOWN_CONVERSION",
      });
      lines.push({
        normalizedName: entry.normalizedName,
        displayName: entry.displayName,
        qty: entry.qty,
        unit: entry.unit,
        estimatedCents: 0,
      });
      continue;
    }
    const estimatedCents = Math.ceil(basisQty * info.estimatedCentsPerBasisUnit);
    totalCents += estimatedCents;
    lines.push({
      normalizedName: entry.normalizedName,
      displayName: entry.displayName,
      qty: entry.qty,
      unit: entry.unit,
      estimatedCents,
    });
  }

  return { totalCents, lines, missing };
}
