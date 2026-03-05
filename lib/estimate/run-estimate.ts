import { getOrderForUser } from "@/lib/queries/orders";
import { getIngredientCostMap } from "@/lib/queries/ingredients";
import { scaleParsedLines } from "./scale-ingredients";
import { aggregateGroceryList, type GroceryEntry } from "./aggregate-grocery-list";
import { estimateCost, type CostEstimateResult } from "./cost-estimator";
import type { ParsedLine } from "./parse-ingredient-line";
import type { Unit } from "./units";

export type OrderEstimateResult = {
  groceryList: GroceryEntry[];
  totalCents: number;
  missing: { normalizedName: string; reason: string }[];
  perLine: CostEstimateResult["lines"];
};

function recipeIngredientToParsedLine(ri: {
  quantity: number | null;
  unit: string | null;
  displayText: string;
  ingredient?: { name: string } | null;
}): ParsedLine {
  return {
    name: (ri.ingredient?.name ?? ri.displayText.trim()) || "—",
    qty: ri.quantity ?? undefined,
    unit: (ri.unit as Unit) ?? undefined,
    original: ri.displayText,
  };
}

export async function runOrderEstimate(
  orderId: string,
  userId: string
): Promise<OrderEstimateResult | null> {
  const order = await getOrderForUser(orderId, userId);
  if (!order) return null;

  const allParsed: { line: ParsedLine; batches: number; recipeTitle: string }[] = [];
  for (const item of order.orderItems) {
    const recipe = item.recipe as {
      id: string;
      title: string;
      recipeIngredients: Array<{
        quantity: number | null;
        unit: string | null;
        displayText: string;
        ingredient: { id: string; name: string } | null;
      }>;
    };
    const ingredients = recipe.recipeIngredients ?? [];
    for (const ri of ingredients) {
      if (!ri.ingredient) continue;
      const parsed = recipeIngredientToParsedLine(ri);
      allParsed.push({
        line: parsed,
        batches: item.batches,
        recipeTitle: recipe.title,
      });
    }
  }

  const scaledWithSource = allParsed.flatMap(({ line, batches, recipeTitle }) => {
    const scaled = scaleParsedLines([line], batches);
    return scaled.map((p) => ({ line: p, recipeTitle }));
  });

  const aggregated = aggregateGroceryList(scaledWithSource);

  const costMap = await getIngredientCostMap();
  const costResult = estimateCost(aggregated, costMap);

  return {
    groceryList: aggregated,
    totalCents: costResult.totalCents,
    missing: costResult.missing,
    perLine: costResult.lines,
  };
}
