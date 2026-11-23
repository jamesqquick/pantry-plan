import type { GroceryListResult } from "@/lib/grocery/aggregate";
import { formatDollars } from "@/lib/money";

interface OrderCostSummaryProps {
  grocery: GroceryListResult | null;
  materialsCostCents: number | null;
  hasUnavailableRecipes?: boolean;
}

export function OrderCostSummary({ grocery, materialsCostCents, hasUnavailableRecipes = false }: OrderCostSummaryProps) {
  const ingredientsCost = grocery?.totalEstimatedCostCents ?? null;
  const incomplete = hasUnavailableRecipes || ingredientsCost === null || !grocery
    || grocery.issues.unmapped.length > 0 || grocery.issues.missingQuantityOrUnit.length > 0
    || grocery.issues.missingCost.length > 0 || grocery.issues.cannotConvert.some((issue) => issue.kind !== "cannot-combine");
  const total = materialsCostCents === null ? null : (ingredientsCost ?? 0) + materialsCostCents;

  return <section aria-label="Order cost summary" className="min-w-0 space-y-4 rounded-xl border border-border bg-panel p-5 sm:p-6">
    <h2 className="font-display text-xl">Cost summary</h2>
    <dl className="space-y-3 text-sm">
      <div className="flex flex-wrap justify-between gap-2"><dt>Ingredients{ingredientsCost !== null && incomplete ? " (known costs)" : ""}</dt><dd className="tabular-nums">{ingredientsCost === null ? "Estimate unavailable" : formatDollars(ingredientsCost)}</dd></div>
      <div className="flex flex-wrap justify-between gap-2"><dt>Materials subtotal</dt><dd className="tabular-nums">{materialsCostCents === null ? "Check amounts" : formatDollars(materialsCostCents)}</dd></div>
      <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4 text-base font-semibold"><dt>{incomplete ? "Known tracked cost" : "Tracked order cost"}</dt><dd className="break-all tabular-nums" aria-live="polite">{total === null ? "–" : formatDollars(total)}</dd></div>
    </dl>
    {incomplete && <p className="text-sm text-muted-foreground">Some ingredient costs are unavailable. The total includes only known costs.</p>}
  </section>;
}
