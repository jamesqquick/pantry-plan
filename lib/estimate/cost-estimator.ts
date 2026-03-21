import type { CostBasisUnit } from "@/generated/prisma/client";
import type { IngredientUnit } from "@/generated/prisma/client";
import { convertToBasis } from "@/lib/grocery/canonical";
import type { GroceryEntry } from "./aggregate-grocery-list";
import type { Unit } from "./units";

export type IngredientCostInfo = {
  costBasisUnit: CostBasisUnit;
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
    const converted = convertToBasis({
      quantity: entry.qty ?? 1,
      unit: (entry.unit ?? "COUNT") as IngredientUnit,
      basisUnit: info.costBasisUnit,
      ingredientConversion: {
        gramsPerCup: info.gramsPerCup,
        cupsPerEach: info.cupsPerEach,
      },
    });
    if (converted == null) {
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
    const estimatedCents = Math.ceil(
      converted.basisQty * info.estimatedCentsPerBasisUnit,
    );
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
