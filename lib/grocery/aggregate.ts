/**
 * Grocery list aggregator: sum by mapped ingredient, convert to canonical basis (server-only).
 * Uses Prisma types only; no Prisma client.
 */
import type { CostBasisUnit } from "@/generated/prisma/client";
import type { IngredientUnit } from "@/generated/prisma/client";
import { convertToBasis, type BasisUnitLabel } from "./canonical";

export type GroceryListResult = {
  totals: Array<{
    ingredientId: string;
    name: string;
    basisUnit: CostBasisUnit;
    basisUnitLabel: BasisUnitLabel;
    totalBasisQty: number;
    estimatedCostCents: number | null;
    anyOptional: boolean;
    preferredDisplayUnit: string;
    gramsPerCup: number | null;
    sources: Array<{
      recipeId: string;
      recipeTitle: string;
      qty: number;
      unit: IngredientUnit | null;
      batches: number;
      basisQty: number | null;
    }>;
  }>;
  issues: {
    unmapped: Array<{ recipeId: string; recipeTitle: string; displayText: string }>;
    missingQuantityOrUnit: Array<{
      recipeId: string;
      recipeTitle: string;
      displayText: string;
    }>;
    cannotConvert: Array<{
      recipeId: string;
      recipeTitle: string;
      ingredientName?: string;
      displayText: string;
      quantity: number | null;
      unit: IngredientUnit | null;
      basisUnit: CostBasisUnit;
      reason: string;
    }>;
    missingCost: Array<{ ingredientId: string; name: string }>;
  };
  totalEstimatedCostCents: number;
};

type RecipeIngredientInput = {
  id: string;
  ingredientId: string | null;
  ingredient?: {
    id: string;
    name: string;
    costBasisUnit: CostBasisUnit;
    estimatedCentsPerBasisUnit: number | null;
    gramsPerCup?: number | null;
    cupsPerEach?: number | null;
    preferredDisplayUnit?: string | null;
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

type Accumulator = {
  ingredientId: string;
  name: string;
  basisUnit: CostBasisUnit;
  basisUnitLabel: BasisUnitLabel;
  totalBasisQty: number;
  anyOptional: boolean;
  sources: GroceryListResult["totals"][0]["sources"];
  estimatedCentsPerBasisUnit: number | null;
  preferredDisplayUnit: string;
  gramsPerCup: number | null;
};

export function buildGroceryList(params: {
  orderItems: OrderItemInput[];
  recipes: RecipeInput[];
}): GroceryListResult {
  const { orderItems, recipes } = params;
  const recipeMap = new Map(recipes.map((r) => [r.id, r]));

  const byIngredientId = new Map<string, Accumulator>();
  const issues: GroceryListResult["issues"] = {
    unmapped: [],
    missingQuantityOrUnit: [],
    cannotConvert: [],
    missingCost: [],
  };

  for (const orderItem of orderItems) {
    const recipe = recipeMap.get(orderItem.recipeId);
    if (!recipe) continue;
    const batches = Math.max(1, orderItem.batches);

    for (const ri of recipe.ingredients) {
      if (ri.ingredientId == null) {
        issues.unmapped.push({
          recipeId: recipe.id,
          recipeTitle: recipe.title,
          displayText: ri.displayText,
        });
        continue;
      }
      if (ri.quantity == null || ri.unit == null) {
        issues.missingQuantityOrUnit.push({
          recipeId: recipe.id,
          recipeTitle: recipe.title,
          displayText: ri.displayText,
        });
        continue;
      }

      const ingredient = ri.ingredient ?? null;
      if (!ingredient) {
        issues.cannotConvert.push({
          recipeId: recipe.id,
          recipeTitle: recipe.title,
          displayText: ri.displayText,
          quantity: ri.quantity,
          unit: ri.unit,
          basisUnit: "GRAM",
          reason: "Ingredient relation missing",
        });
        continue;
      }

      const scaledQty = ri.quantity * batches;
      const basisUnit = ingredient.costBasisUnit;
      const converted = convertToBasis({
        quantity: scaledQty,
        unit: ri.unit,
        basisUnit,
        ingredientConversion: {
          gramsPerCup: ingredient.gramsPerCup ?? undefined,
          cupsPerEach: ingredient.cupsPerEach ?? undefined,
        },
      });

      if (converted == null) {
        issues.cannotConvert.push({
          recipeId: recipe.id,
          recipeTitle: recipe.title,
          ingredientName: ingredient.name,
          displayText: ri.displayText,
          quantity: ri.quantity,
          unit: ri.unit,
          basisUnit,
          reason: `Cannot convert ${ri.unit} to ${basisUnit}`,
        });
        continue;
      }

      let acc = byIngredientId.get(ri.ingredientId);
      if (!acc) {
        acc = {
          ingredientId: ingredient.id,
          name: ingredient.name,
          basisUnit,
          basisUnitLabel: converted.basisUnitLabel,
          totalBasisQty: 0,
          anyOptional: false,
          sources: [],
          estimatedCentsPerBasisUnit: ingredient.estimatedCentsPerBasisUnit ?? null,
          preferredDisplayUnit: ingredient.preferredDisplayUnit ?? "AUTO",
          gramsPerCup: ingredient.gramsPerCup ?? null,
        };
        byIngredientId.set(ri.ingredientId, acc);
      }
      acc.totalBasisQty += converted.basisQty;
      acc.sources.push({
        recipeId: recipe.id,
        recipeTitle: recipe.title,
        qty: ri.quantity,
        unit: ri.unit,
        batches,
        basisQty: converted.basisQty,
      });
    }
  }

  const totals: GroceryListResult["totals"] = [];
  let totalEstimatedCostCents = 0;

  for (const acc of byIngredientId.values()) {
    const estimatedCostCents =
      acc.estimatedCentsPerBasisUnit != null
        ? Math.ceil(acc.totalBasisQty * acc.estimatedCentsPerBasisUnit)
        : null;
    if (estimatedCostCents != null) {
      totalEstimatedCostCents += estimatedCostCents;
    } else {
      issues.missingCost.push({ ingredientId: acc.ingredientId, name: acc.name });
    }
    totals.push({
      ingredientId: acc.ingredientId,
      name: acc.name,
      basisUnit: acc.basisUnit,
      basisUnitLabel: acc.basisUnitLabel,
      totalBasisQty: acc.totalBasisQty,
      estimatedCostCents,
      anyOptional: acc.anyOptional,
      preferredDisplayUnit: acc.preferredDisplayUnit,
      gramsPerCup: acc.gramsPerCup,
      sources: acc.sources,
    });
  }

  totals.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

  return {
    totals,
    issues,
    totalEstimatedCostCents,
  };
}
