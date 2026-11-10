/**
 * Grocery list aggregator: preserve native quantity groups and price them separately.
 * Uses Drizzle result shapes only; no database client is imported here.
 */
import type { CostBasisUnit, IngredientDisplayUnit, IngredientUnit, PurchaseUnit } from "@/db/schema/enums";
import { COST_BASIS_SHORT_LABELS } from "./cost-basis-units";
import { convertToBasis, lineVolumeToCups, toGrams, type BasisUnitLabel, type IngredientConversion } from "./canonical";

export type GroceryGroupUnit = "G" | "CUP" | "COUNT";
export type MissingCostReason = "missing-price" | "missing-purchase-details" | "missing-conversion";

type GrocerySource = {
  recipeIngredientId: string;
  recipeId: string;
  recipeTitle: string;
  displayText: string;
  qty: number;
  unit: IngredientUnit;
  batches: number;
  basisQty: number;
};

export type GroceryListResult = {
  totals: Array<{
    groupKey: string;
    ingredientId: string;
    name: string;
    basisUnit: GroceryGroupUnit;
    basisUnitLabel: BasisUnitLabel;
    totalBasisQty: number;
    estimatedCostCents: number | null;
    anyOptional: boolean;
    preferredDisplayUnit: IngredientDisplayUnit;
    purchaseUnit: PurchaseUnit | null;
    gramsPerCup: number | null;
    gramsPerEach: number | null;
    cupsPerEach: number | null;
    sources: GrocerySource[];
  }>;
  issues: {
    unmapped: Array<{
      recipeId: string;
      recipeTitle: string;
      displayText: string;
      quantity: number | null;
      unit: IngredientUnit | null;
      batches: number;
    }>;
    missingQuantityOrUnit: Array<{
      recipeId: string;
      recipeTitle: string;
      displayText: string;
      quantity: number | null;
      unit: IngredientUnit | null;
      batches: number;
    }>;
    cannotConvert: Array<{
      kind: "missing-conversion" | "cannot-combine" | "missing-ingredient";
      recipeId: string;
      recipeTitle: string;
      ingredientId: string | null;
      ingredientName?: string;
      groupKey?: string;
      displayText: string;
      quantity: number | null;
      unit: IngredientUnit | null;
      batches: number;
      basisUnit?: CostBasisUnit;
      reason: string;
    }>;
    missingCost: Array<{
      groupKey: string;
      ingredientId: string;
      name: string;
      reason: MissingCostReason;
      sources: GrocerySource[];
    }>;
  };
  totalEstimatedCostCents: number | null;
};

type RecipeIngredientInput = {
  id: string;
  ingredientId: string | null;
  ingredient?: {
    id: string;
    name: string;
    costBasisUnit: CostBasisUnit;
    estimatedCentsPerBasisUnit: number | null;
    purchasePriceCents?: number | null;
    purchaseQuantity?: number | null;
    purchaseUnit?: PurchaseUnit | null;
    gramsPerCup?: number | null;
    gramsPerEach?: number | null;
    cupsPerEach?: number | null;
    preferredDisplayUnit?: IngredientDisplayUnit | null;
  } | null;
  quantity: number | null;
  unit: IngredientUnit | null;
  displayText: string;
};

type RecipeInput = {
  id: string;
  title: string;
  ingredients: RecipeIngredientInput[];
};

type OrderItemInput = {
  recipeId: string;
  batches: number;
};

type IngredientInput = NonNullable<RecipeIngredientInput["ingredient"]>;

type Accumulator = {
  groupKey: string;
  ingredientId: string;
  name: string;
  basisUnit: GroceryGroupUnit;
  basisUnitLabel: BasisUnitLabel;
  totalBasisQty: number;
  anyOptional: boolean;
  sources: GrocerySource[];
  costBasisUnit: CostBasisUnit;
  estimatedCentsPerBasisUnit: number | null;
  purchasePriceCents: number | null;
  purchaseQuantity: number | null;
  purchaseUnit: PurchaseUnit | null;
  preferredDisplayUnit: IngredientDisplayUnit;
  gramsPerCup: number | null;
  gramsPerEach: number | null;
  cupsPerEach: number | null;
};

function costDimensionUnit(unit: CostBasisUnit): GroceryGroupUnit {
  if (unit === "COUNT") return "COUNT";
  if (unit === "CUP" || unit === "TBSP" || unit === "TSP") return "CUP";
  return "G";
}

function ingredientConversion(ingredient: IngredientInput) {
  return {
    gramsPerCup: ingredient.gramsPerCup ?? undefined,
    gramsPerEach: ingredient.gramsPerEach ?? undefined,
    cupsPerEach: ingredient.cupsPerEach ?? undefined,
  };
}

function nativeQuantityGroup(quantity: number, unit: IngredientUnit) {
  if (unit === "COUNT") return { basisUnit: "COUNT" as const, basisQty: quantity };
  const grams = toGrams(quantity, unit);
  if (grams != null) return { basisUnit: "G" as const, basisQty: grams };
  const cups = lineVolumeToCups(quantity, unit);
  if (cups != null) return { basisUnit: "CUP" as const, basisQty: cups };
  return null;
}

function quantityGroup(quantity: number, unit: IngredientUnit, ingredient: IngredientInput) {
  // Without density, COUNT is the shared target for item-weight and item-volume bridges.
  const preferredGroupUnit = ingredient.gramsPerCup == null &&
    ingredient.gramsPerEach != null && ingredient.gramsPerEach > 0 &&
    ingredient.cupsPerEach != null && ingredient.cupsPerEach > 0
    ? "COUNT" : costDimensionUnit(ingredient.costBasisUnit);
  const groupUnits = new Set<GroceryGroupUnit>([preferredGroupUnit, "G", "CUP", "COUNT"]);
  for (const groupUnit of groupUnits) {
    const converted = convertToBasis({
      quantity,
      unit,
      basisUnit: groupUnit,
      ingredientConversion: ingredientConversion(ingredient),
    });
    if (converted != null && Number.isFinite(converted.basisQty)) {
      return { basisUnit: groupUnit, basisQty: converted.basisQty };
    }
  }
  return nativeQuantityGroup(quantity, unit);
}

export function incompatibleGroupReason(first: GroceryGroupUnit, second: GroceryGroupUnit, ingredient: IngredientConversion) {
  const pair = new Set([first, second]);
  if (pair.has("G") && pair.has("CUP")) {
    return "Add a volume-to-weight reference to combine mass and volume quantities; kept separate.";
  }
  if (pair.has("COUNT") && pair.has("G")) {
    const hasWeight = ingredient.gramsPerEach != null ||
      (ingredient.gramsPerCup != null && ingredient.cupsPerEach != null);
    return hasWeight
      ? "These count and mass quantities could not be combined; kept separate."
      : "Add weight per item to combine count and mass quantities; kept separate.";
  }
  return "Add a count-to-volume reference to combine count and volume quantities; kept separate.";
}

function missingConversionReason(groupUnit: GroceryGroupUnit, costBasisUnit: CostBasisUnit) {
  if (groupUnit === "COUNT" && (costBasisUnit === "G" || costBasisUnit === "KG" || costBasisUnit === "LB" || costBasisUnit === "OZ")) {
    return `An item weight is needed to price count quantities against the saved ${costBasisUnit} cost basis.`;
  }
  if (groupUnit === "COUNT" || groupUnit === "CUP") {
    return `Add a volume-to-weight reference to price ${groupUnit === "COUNT" ? "count" : "volume"} quantities against the saved ${costBasisUnit} cost basis.`;
  }
  return `Add a volume-to-weight reference to price mass quantities against the saved ${costBasisUnit} cost basis.`;
}

function missingCostReason(ingredient: Pick<IngredientInput, "estimatedCentsPerBasisUnit" | "purchasePriceCents" | "purchaseQuantity" | "purchaseUnit">): MissingCostReason {
  if (ingredient.estimatedCentsPerBasisUnit != null) return "missing-conversion";
  if (ingredient.purchasePriceCents != null && (ingredient.purchaseQuantity == null || ingredient.purchaseUnit == null)) {
    return "missing-purchase-details";
  }
  return "missing-price";
}

function issueForSource(params: {
  kind: "missing-conversion" | "cannot-combine";
  group: Accumulator;
  source: GrocerySource;
  reason: string;
}): GroceryListResult["issues"]["cannotConvert"][number] {
  const { kind, group, source, reason } = params;
  return {
    kind,
    recipeId: source.recipeId,
    recipeTitle: source.recipeTitle,
    ingredientId: group.ingredientId,
    ingredientName: group.name,
    groupKey: group.groupKey,
    displayText: source.displayText,
    quantity: source.qty,
    unit: source.unit,
    batches: source.batches,
    basisUnit: group.basisUnit,
    reason,
  };
}

export function buildGroceryList(params: {
  orderItems: OrderItemInput[];
  recipes: RecipeInput[];
}): GroceryListResult {
  const { orderItems, recipes } = params;
  const recipeMap = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const byGroupKey = new Map<string, Accumulator>();
  const issues: GroceryListResult["issues"] = {
    unmapped: [],
    missingQuantityOrUnit: [],
    cannotConvert: [],
    missingCost: [],
  };

  for (const orderItem of orderItems) {
    const recipe = recipeMap.get(orderItem.recipeId);
    if (!recipe) continue;
    const batches = Math.max(0.01, orderItem.batches);

    for (const ri of recipe.ingredients) {
      if (ri.ingredientId == null) {
        issues.unmapped.push({
          recipeId: recipe.id,
          recipeTitle: recipe.title,
          displayText: ri.displayText,
          quantity: ri.quantity,
          unit: ri.unit,
          batches,
        });
        continue;
      }
      if (ri.quantity == null || ri.unit == null) {
        issues.missingQuantityOrUnit.push({
          recipeId: recipe.id,
          recipeTitle: recipe.title,
          displayText: ri.displayText,
          quantity: ri.quantity,
          unit: ri.unit,
          batches,
        });
        continue;
      }

      const ingredient = ri.ingredient ?? null;
      if (!ingredient) {
        issues.cannotConvert.push({
          kind: "missing-ingredient",
          recipeId: recipe.id,
          recipeTitle: recipe.title,
          ingredientId: ri.ingredientId,
          displayText: ri.displayText,
          quantity: ri.quantity,
          unit: ri.unit,
          batches,
          reason: "The mapped ingredient is unavailable.",
        });
        continue;
      }

      const scaledQty = ri.quantity * batches;
      const grouped = quantityGroup(scaledQty, ri.unit, ingredient);
      if (grouped == null || !Number.isFinite(grouped.basisQty)) {
        issues.cannotConvert.push({
          kind: "missing-conversion",
          recipeId: recipe.id,
          recipeTitle: recipe.title,
          ingredientId: ri.ingredientId,
          ingredientName: ingredient.name,
          displayText: ri.displayText,
          quantity: ri.quantity,
          unit: ri.unit,
          batches,
          reason: `Cannot retain ${ri.unit} as a grocery quantity.`,
        });
        continue;
      }

      const groupKey = `${ri.ingredientId}:${grouped.basisUnit}`;
      let acc = byGroupKey.get(groupKey);
      if (!acc) {
        acc = {
          groupKey,
          ingredientId: ri.ingredientId,
          name: ingredient.name,
          basisUnit: grouped.basisUnit,
          basisUnitLabel: COST_BASIS_SHORT_LABELS[grouped.basisUnit],
          totalBasisQty: 0,
          anyOptional: false,
          sources: [],
          costBasisUnit: ingredient.costBasisUnit,
          estimatedCentsPerBasisUnit: ingredient.estimatedCentsPerBasisUnit ?? null,
          purchasePriceCents: ingredient.purchasePriceCents ?? null,
          purchaseQuantity: ingredient.purchaseQuantity ?? null,
          purchaseUnit: ingredient.purchaseUnit ?? null,
          preferredDisplayUnit: ingredient.preferredDisplayUnit ?? "AUTO",
          gramsPerCup: ingredient.gramsPerCup ?? null,
          gramsPerEach: ingredient.gramsPerEach ?? null,
          cupsPerEach: ingredient.cupsPerEach ?? null,
        };
        byGroupKey.set(groupKey, acc);
      }

      acc.totalBasisQty += grouped.basisQty;
      acc.sources.push({
        recipeIngredientId: ri.id,
        recipeId: recipe.id,
        recipeTitle: recipe.title,
        displayText: ri.displayText,
        qty: ri.quantity,
        unit: ri.unit,
        batches,
        basisQty: grouped.basisQty,
      });
    }
  }

  const groupsByIngredient = new Map<string, Accumulator[]>();
  for (const group of byGroupKey.values()) {
    const groups = groupsByIngredient.get(group.ingredientId) ?? [];
    groups.push(group);
    groupsByIngredient.set(group.ingredientId, groups);
  }

  for (const groups of groupsByIngredient.values()) {
    for (let firstIndex = 0; firstIndex < groups.length; firstIndex++) {
      const first = groups[firstIndex]!;
      for (let secondIndex = firstIndex + 1; secondIndex < groups.length; secondIndex++) {
        const second = groups[secondIndex]!;
        const reason = incompatibleGroupReason(first.basisUnit, second.basisUnit, first);
        for (const group of [first, second]) {
          for (const source of group.sources) {
            issues.cannotConvert.push(issueForSource({ kind: "cannot-combine", group, source, reason }));
          }
        }
      }
    }
  }

  const totals: GroceryListResult["totals"] = [];
  let totalEstimatedCostCents: number | null = null;

  for (const acc of byGroupKey.values()) {
    const costQuantity = convertToBasis({
      quantity: acc.totalBasisQty,
      unit: acc.basisUnit,
      basisUnit: acc.costBasisUnit,
      ingredientConversion: {
        gramsPerCup: acc.gramsPerCup ?? undefined,
        gramsPerEach: acc.gramsPerEach ?? undefined,
        cupsPerEach: acc.cupsPerEach ?? undefined,
      },
    });
    const rate = acc.estimatedCentsPerBasisUnit;
    let estimatedCostCents: number | null = null;

    if (rate == null || !Number.isFinite(rate) || rate < 0) {
      const reason = missingCostReason(acc);
      issues.missingCost.push({
        groupKey: acc.groupKey,
        ingredientId: acc.ingredientId,
        name: acc.name,
        reason,
        sources: acc.sources,
      });
    } else if (costQuantity == null || !Number.isFinite(costQuantity.basisQty)) {
      issues.missingCost.push({
        groupKey: acc.groupKey,
        ingredientId: acc.ingredientId,
        name: acc.name,
        reason: "missing-conversion",
        sources: acc.sources,
      });
      for (const source of acc.sources) {
        issues.cannotConvert.push(issueForSource({
          kind: "missing-conversion",
          group: acc,
          source,
          reason: missingConversionReason(acc.basisUnit, acc.costBasisUnit),
        }));
      }
    } else {
      const cost = Math.round(costQuantity.basisQty * rate);
      if (Number.isFinite(cost)) estimatedCostCents = cost;
      if (!Number.isFinite(cost)) {
        issues.missingCost.push({
          groupKey: acc.groupKey,
          ingredientId: acc.ingredientId,
          name: acc.name,
          reason: "missing-conversion",
          sources: acc.sources,
        });
      }
    }

    if (estimatedCostCents != null) {
      totalEstimatedCostCents = (totalEstimatedCostCents ?? 0) + estimatedCostCents;
    }
    totals.push({
      groupKey: acc.groupKey,
      ingredientId: acc.ingredientId,
      name: acc.name,
      basisUnit: acc.basisUnit,
      basisUnitLabel: acc.basisUnitLabel,
      totalBasisQty: acc.totalBasisQty,
      estimatedCostCents,
      anyOptional: acc.anyOptional,
      preferredDisplayUnit: acc.preferredDisplayUnit,
      purchaseUnit: acc.purchaseUnit,
      gramsPerCup: acc.gramsPerCup,
      gramsPerEach: acc.gramsPerEach,
      cupsPerEach: acc.cupsPerEach,
      sources: acc.sources,
    });
  }

  totals.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.groupKey.localeCompare(b.groupKey));

  return {
    totals,
    issues,
    totalEstimatedCostCents,
  };
}
