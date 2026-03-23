"use client";

import { useState, useMemo } from "react";
import type { CostBasisUnit } from "@/generated/prisma/client";
import { costBasisToCanonicalDisplay } from "@/lib/grocery/cost-basis-units";
import { GroceryDisplayToggle } from "./grocery-display-toggle";
import {
  toDisplayUnits,
  formatCanonicalForKitchen,
  type CanonicalUnit,
  type DisplayPreference,
  type CanonicalUnitLabel,
} from "@/lib/grocery/display-units";
import { PrimaryList, type PrimaryListItem } from "@/components/ui/primary-list";
import { formatDollars } from "@/lib/money";

type GroceryRow = {
  ingredientId: string;
  name: string;
  basisUnit: string;
  basisUnitLabel: CanonicalUnitLabel;
  totalBasisQty: number;
  estimatedCostCents: number | null;
  anyOptional: boolean;
  preferredDisplayUnit: string;
  gramsPerCup: number | null;
};

export function GroceryListDisplay({
  totals,
  title,
  actions,
  showCostEstimates = true,
}: {
  totals: GroceryRow[];
  title?: string;
  actions?: React.ReactNode;
  /** When false, per-ingredient cost estimates are hidden (e.g. on meal planner). */
  showCostEstimates?: boolean;
}) {
  const [mode, setMode] = useState<"shopper" | "kitchen">("shopper");

  const canonicalUnit = (u: string): CanonicalUnit =>
    costBasisToCanonicalDisplay(u as CostBasisUnit);

  const listItems = useMemo((): PrimaryListItem[] => {
    return totals.map((row) => {
      const quantityText =
        mode === "kitchen"
          ? formatCanonicalForKitchen(row.totalBasisQty, row.basisUnitLabel)
          : toDisplayUnits({
              canonicalQty: row.totalBasisQty,
              canonicalUnit: canonicalUnit(row.basisUnit),
              ingredient: {
                preferredDisplayUnit:
                  row.preferredDisplayUnit as DisplayPreference,
                gramsPerCup: row.gramsPerCup,
              },
            }).displayText;
      const secondaryText =
        showCostEstimates &&
        row.estimatedCostCents != null &&
        row.estimatedCostCents > 0
          ? `≈ ${formatDollars(row.estimatedCostCents)}`
          : undefined;
      return {
        id: row.ingredientId,
        primaryText: `${row.name} — ${quantityText}`,
        badge: row.anyOptional ? "optional" : undefined,
        secondaryText,
      };
    });
  }, [totals, mode, showCostEstimates]);

  return (
    <section>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <h2 className="text-lg font-medium text-foreground">
          {title ?? "Grocery list"}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <GroceryDisplayToggle mode={mode} onModeChange={setMode} />
          {actions}
        </div>
      </div>
      {totals.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          No mapped ingredients. Add structured ingredients to recipes to see
          totals.
        </p>
      ) : (
        <div className="mt-2">
          <PrimaryList
            items={listItems}
            aria-label="Grocery list"
          />
        </div>
      )}
    </section>
  );
}
