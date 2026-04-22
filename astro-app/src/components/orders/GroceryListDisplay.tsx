import { useState } from "react";
import { formatDollars } from "@/lib/money";
import {
  toDisplayUnits,
  formatCanonicalForKitchen,
} from "@/lib/grocery/display-units";
import { costBasisToCanonicalDisplay } from "@/lib/grocery/cost-basis-units";
import type { GroceryListResult } from "@/lib/grocery/aggregate";
import type { CostBasisUnit } from "@/db/schema/enums";

type DisplayMode = "shopper" | "kitchen";

interface GroceryListDisplayProps {
  grocery: GroceryListResult;
  showCost?: boolean;
}

function formatIngredientLine(
  row: GroceryListResult["totals"][0],
  mode: DisplayMode,
): string {
  if (mode === "kitchen") {
    return formatCanonicalForKitchen(row.totalBasisQty, row.basisUnitLabel);
  }
  // Shopper mode: use display unit preferences.
  const canonicalUnit = costBasisToCanonicalDisplay(row.basisUnit as CostBasisUnit);
  const display = toDisplayUnits({
    canonicalQty: row.totalBasisQty,
    canonicalUnit,
    ingredient: {
      preferredDisplayUnit: (row.preferredDisplayUnit ?? "AUTO") as any,
      gramsPerCup: row.gramsPerCup ?? null,
    },
  });
  return display.displayText;
}

function buildPlainTextList(
  totals: GroceryListResult["totals"],
  mode: DisplayMode,
): string {
  return totals
    .map((row) => `${row.name} — ${formatIngredientLine(row, mode)}`)
    .join("\n");
}

export function GroceryListDisplay({
  grocery,
  showCost = true,
}: GroceryListDisplayProps) {
  const [mode, setMode] = useState<DisplayMode>("shopper");
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    const text = buildPlainTextList(grocery.totals, mode);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleShare() {
    const text = buildPlainTextList(grocery.totals, mode);
    if (navigator.share) {
      await navigator.share({ title: "Grocery List", text });
    } else {
      await handleCopy();
    }
  }

  if (grocery.totals.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No ingredients to aggregate. Make sure your recipes have mapped ingredients with quantities.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border bg-panel p-0.5">
          <button
            type="button"
            className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              mode === "shopper"
                ? "bg-card text-card-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setMode("shopper")}
          >
            Shopper
          </button>
          <button
            type="button"
            className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              mode === "kitchen"
                ? "bg-card text-card-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setMode("kitchen")}
          >
            Kitchen
          </button>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border bg-card px-3 py-1 text-xs font-medium text-card-foreground transition-colors hover:bg-primary/5"
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

        {typeof navigator !== "undefined" && "share" in navigator && (
          <button
            type="button"
            onClick={handleShare}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border bg-card px-3 py-1 text-xs font-medium text-card-foreground transition-colors hover:bg-primary/5"
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
        )}
      </div>

      {/* Grocery list */}
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {grocery.totals.map((row) => {
          const qtyText = formatIngredientLine(row, mode);
          return (
            <li
              key={row.ingredientId}
              className="flex items-center justify-between gap-4 px-4 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-card-foreground">
                  {row.name}
                </p>
                <p className="text-xs text-muted-foreground">{qtyText}</p>
              </div>
              {showCost && row.estimatedCostCents != null && (
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {formatDollars(row.estimatedCostCents)}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {/* Total cost */}
      {showCost && grocery.totalEstimatedCostCents > 0 && (
        <div className="flex items-baseline justify-between rounded-lg border border-border bg-card px-4 py-3">
          <span className="text-sm font-medium text-card-foreground">
            Estimated total
          </span>
          <span className="font-display text-lg font-bold tabular-nums text-primary-on-card">
            {formatDollars(grocery.totalEstimatedCostCents)}
          </span>
        </div>
      )}
    </div>
  );
}
