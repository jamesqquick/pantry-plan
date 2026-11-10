import { useState } from "react";
import { formatDollars } from "@/lib/money";
import {
  toDisplayUnits,
  formatCanonicalForKitchen,
  formatDisplayQty,
} from "@/lib/grocery/display-units";
import {
  costBasisToCanonicalDisplay,
  costBasisToCanonicalQuantity,
} from "@/lib/grocery/cost-basis-units";
import type { GroceryListResult } from "@/lib/grocery/aggregate";

type DisplayMode = "shopper" | "kitchen";
type GroceryRow = GroceryListResult["totals"][number];

interface GroceryListDisplayProps {
  grocery: GroceryListResult;
  showCost?: boolean;
}

function formatIngredientLine(
  row: GroceryRow,
  mode: DisplayMode,
): { text: string; reason?: string } {
  if (mode === "kitchen") {
    return { text: formatCanonicalForKitchen(row.totalBasisQty, row.basisUnitLabel) };
  }
  const canonicalUnit = costBasisToCanonicalDisplay(row.basisUnit);
  const canonicalQty = costBasisToCanonicalQuantity(
    row.totalBasisQty,
    row.basisUnit,
  );
  const display = toDisplayUnits({
    canonicalQty,
    canonicalUnit,
    ingredient: {
      preferredDisplayUnit: row.preferredDisplayUnit ?? "AUTO",
      purchaseUnit: row.purchaseUnit,
      gramsPerCup: row.gramsPerCup ?? null,
      gramsPerEach: row.gramsPerEach ?? null,
      cupsPerEach: row.cupsPerEach ?? null,
    },
  });
  return { text: display.displayText, reason: display.reason };
}

function batchContext(batches: number): string {
  return `${formatDisplayQty(batches)}× batches`;
}

function sourceContext(sources: GroceryRow["sources"]): string {
  return sources.map((source) => `${source.recipeTitle} (${batchContext(source.batches)})`).join(", ");
}

function missingCostMessage(reason: GroceryListResult["issues"]["missingCost"][number]["reason"]): string {
  switch (reason) {
    case "missing-price":
      return "Add a price to estimate cost.";
    case "missing-purchase-details":
      return "Add the purchase amount and unit to estimate cost.";
    case "missing-conversion":
      return "Add the required conversion to estimate cost.";
  }
}

function buildPlainTextList(
  grocery: GroceryListResult,
  mode: DisplayMode,
  showCost: boolean,
): string {
  const lines = grocery.totals.map((row) => {
    const display = formatIngredientLine(row, mode);
    const reason = display.reason ? ` — ${display.reason}` : "";
    const cost = showCost && row.estimatedCostCents != null ? ` — ${formatDollars(row.estimatedCostCents)}` : "";
    const sources = row.sources.length > 0 ? ` — From ${sourceContext(row.sources)}` : "";
    return `${row.name} — ${display.text}${reason}${cost}${sources}`;
  });

  for (const issue of grocery.issues.unmapped) {
    lines.push(`${issue.recipeTitle} (${batchContext(issue.batches)}): ${issue.displayText} — Ingredient is not mapped.`);
  }
  for (const issue of grocery.issues.missingQuantityOrUnit) {
    lines.push(`${issue.recipeTitle} (${batchContext(issue.batches)}): ${issue.displayText} — Add a recipe quantity and unit.`);
  }
  for (const issue of grocery.issues.cannotConvert) {
    if (issue.kind === "missing-conversion" && !showCost) continue;
    lines.push(`${issue.recipeTitle} (${batchContext(issue.batches)}): ${issue.displayText} — ${issue.reason}`);
  }
  if (showCost) {
    for (const issue of grocery.issues.missingCost) {
      const sources = issue.sources.length > 0 ? ` Used by ${sourceContext(issue.sources)}.` : "";
      lines.push(`${issue.name}: ${missingCostMessage(issue.reason)}${sources}`);
    }
  }

  const hasPricedRows = grocery.totals.some((row) => row.estimatedCostCents != null);
  const hasExcludedLines = grocery.totals.some((row) => row.estimatedCostCents == null) ||
    grocery.issues.unmapped.length > 0 ||
    grocery.issues.missingQuantityOrUnit.length > 0 ||
    grocery.issues.missingCost.length > 0 ||
    grocery.issues.cannotConvert.some((issue) => issue.kind !== "cannot-combine");
  if (showCost && (grocery.totals.length > 0 || lines.length > 0)) {
    if (!hasPricedRows || grocery.totalEstimatedCostCents == null) {
      lines.push("Cost estimate unavailable");
    } else {
      const label = hasExcludedLines ? "Known-cost subtotal" : "Estimated total";
      lines.push(`${label}: ${formatDollars(grocery.totalEstimatedCostCents)}`);
    }
  }

  return lines.join("\n");
}

export function GroceryListDisplay({
  grocery,
  showCost = true,
}: GroceryListDisplayProps) {
  const [mode, setMode] = useState<DisplayMode>("shopper");
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const text = buildPlainTextList(grocery, mode, showCost);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShare() {
    const text = buildPlainTextList(grocery, mode, showCost);
    if (navigator.share) {
      await navigator.share({ title: "Grocery List", text });
    } else {
      await handleCopy();
    }
  }

  const visibleConversionIssues = grocery.issues.cannotConvert.filter((issue) =>
    issue.kind !== "missing-conversion" || showCost,
  );
  const hasVisibleIssues = grocery.issues.unmapped.length > 0 ||
    grocery.issues.missingQuantityOrUnit.length > 0 ||
    visibleConversionIssues.length > 0 ||
    (showCost && grocery.issues.missingCost.length > 0);
  if (grocery.totals.length === 0 && !hasVisibleIssues) {
    return (
      <p className="text-body text-muted-foreground">
        No ingredients to aggregate. Make sure your recipes have mapped ingredients with quantities.
      </p>
    );
  }

  const hasPricedRows = grocery.totals.some((row) => row.estimatedCostCents != null);
  const hasExcludedLines = grocery.totals.some((row) => row.estimatedCostCents == null) ||
    grocery.issues.unmapped.length > 0 ||
    grocery.issues.missingQuantityOrUnit.length > 0 ||
    grocery.issues.missingCost.length > 0 ||
    grocery.issues.cannotConvert.some((issue) => issue.kind !== "cannot-combine");
  const costLabel = !hasPricedRows || grocery.totalEstimatedCostCents == null
    ? "Cost estimate unavailable"
    : hasExcludedLines
      ? "Known-cost subtotal"
      : "Estimated total";

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border bg-panel p-0.5">
          <button
            type="button"
            className={`min-h-11 cursor-pointer rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              mode === "shopper"
                ? "bg-card text-card-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setMode("shopper")}
            aria-pressed={mode === "shopper"}
          >
            Shopper
          </button>
          <button
            type="button"
            className={`min-h-11 cursor-pointer rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              mode === "kitchen"
                ? "bg-card text-card-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setMode("kitchen")}
            aria-pressed={mode === "kitchen"}
          >
            Kitchen
          </button>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-card-foreground transition-colors hover:bg-primary/5"
        >
          {/* Lucide Copy */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
          </svg>
          {copied ? "Copied!" : "Copy"}
        </button>

        <button
          type="button"
          onClick={handleShare}
          className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-card-foreground transition-colors hover:bg-primary/5"
        >
          {/* Lucide Share */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" x2="12" y1="2" y2="15" />
          </svg>
          Share
        </button>
      </div>

      {/* Grocery list */}
      {grocery.totals.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {grocery.totals.map((row) => {
            const display = formatIngredientLine(row, mode);
            return (
              <li
                key={row.groupKey}
                className="grid grid-cols-1 items-start gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto]"
              >
                <div className="min-w-0">
                  <p className="whitespace-normal text-body font-medium text-card-foreground [overflow-wrap:anywhere]">
                    {row.name}
                  </p>
                  <p className="whitespace-normal text-meta text-muted-foreground [overflow-wrap:anywhere]">
                    {display.text}
                  </p>
                  {display.reason && (
                    <p className="mt-1 text-meta text-muted-foreground [overflow-wrap:anywhere]">
                      {display.reason}
                    </p>
                  )}
                </div>
                {showCost && row.estimatedCostCents != null && (
                  <span className="shrink-0 whitespace-nowrap text-left text-meta tabular-nums text-muted-foreground sm:text-right">
                    {formatDollars(row.estimatedCostCents)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {hasVisibleIssues && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-body text-amber-800 dark:border-amber-800/30 dark:bg-amber-900/10 dark:text-amber-300">
          <h3 className="mb-3 font-display text-lg">Items to review</h3>
          <div className="space-y-4">
            {grocery.issues.unmapped.length > 0 && (
              <div>
                <p className="font-medium">Unmapped ingredients ({grocery.issues.unmapped.length})</p>
                <ul className="mt-1 list-inside list-disc space-y-1">
                  {grocery.issues.unmapped.map((issue, index) => (
                    <li key={`${issue.recipeId}:unmapped:${index}`}>
                      <a href={`/recipes/${issue.recipeId}`} className="underline underline-offset-2">{issue.recipeTitle}</a>
                      {` (${batchContext(issue.batches)}): ${issue.displayText} — Ingredient is not mapped.`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {grocery.issues.missingQuantityOrUnit.length > 0 && (
              <div>
                <p className="font-medium">Recipe measurements needed ({grocery.issues.missingQuantityOrUnit.length})</p>
                <ul className="mt-1 list-inside list-disc space-y-1">
                  {grocery.issues.missingQuantityOrUnit.map((issue, index) => (
                    <li key={`${issue.recipeId}:measurement:${index}`}>
                      <a href={`/recipes/${issue.recipeId}`} className="underline underline-offset-2">{issue.recipeTitle}</a>
                      {` (${batchContext(issue.batches)}): ${issue.displayText} — Add a recipe quantity and unit.`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {visibleConversionIssues.length > 0 && (
              <div>
                <p className="font-medium">Quantity and conversion notes ({visibleConversionIssues.length})</p>
                <ul className="mt-1 list-inside list-disc space-y-1">
                  {visibleConversionIssues.map((issue, index) => (
                    <li key={`${issue.recipeId}:${issue.groupKey ?? issue.kind}:${index}`}>
                      <a href={`/recipes/${issue.recipeId}`} className="underline underline-offset-2">{issue.recipeTitle}</a>
                      {` (${batchContext(issue.batches)}): ${issue.displayText} — ${issue.reason}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {showCost && grocery.issues.missingCost.length > 0 && (
              <div>
                <p className="font-medium">Cost details needed ({grocery.issues.missingCost.length})</p>
                <ul className="mt-1 list-inside list-disc space-y-1">
                  {grocery.issues.missingCost.map((issue) => (
                    <li key={issue.groupKey}>
                      <a href={`/ingredients/${issue.ingredientId}`} className="underline underline-offset-2">{issue.name}</a>
                      {` — ${missingCostMessage(issue.reason)}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Total cost */}
      {showCost && (
        <div className="flex min-w-0 items-baseline justify-between gap-4 rounded-lg border border-border bg-card px-4 py-3">
          <span className="text-sm font-medium text-card-foreground">
            {costLabel}
          </span>
          {hasPricedRows && grocery.totalEstimatedCostCents != null && (
            <span className="min-w-0 text-right font-display text-lg tabular-nums text-primary-on-card [overflow-wrap:anywhere]">
              {formatDollars(grocery.totalEstimatedCostCents)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
