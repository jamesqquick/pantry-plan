"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { GroceryDisplayToggle } from "./grocery-display-toggle";
import {
  toDisplayUnits,
  formatCanonicalForKitchen,
  type CanonicalUnit,
  type DisplayPreference,
  type CanonicalUnitLabel,
} from "@/lib/grocery/display-units";
import { formatQuantity } from "@/lib/quantity/quantity";
import { PrimaryList, type PrimaryListItem } from "@/components/ui/primary-list";

type GrocerySource = {
  qty: number;
  unit: string | null;
  batches: number;
  recipeId?: string;
  recipeTitle?: string;
  basisQty?: number | null;
};

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
  sources?: GrocerySource[];
};

function formatSourceAmount(
  s: GrocerySource,
  basisUnitLabel: CanonicalUnitLabel
): string {
  if (s.basisQty != null) {
    return formatCanonicalForKitchen(s.basisQty, basisUnitLabel);
  }
  return s.batches > 1
    ? `(${formatQuantity(s.qty)} × ${s.batches})`
    : formatQuantity(s.qty);
}

function formatDollars(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export function GroceryListDisplay({
  totals,
  title,
  actions,
}: {
  totals: GroceryRow[];
  title?: string;
  actions?: React.ReactNode;
}) {
  const [mode, setMode] = useState<"shopper" | "kitchen">("shopper");

  const canonicalUnit = (u: string): CanonicalUnit => {
    if (u === "CUP" || u === "GRAM" || u === "EACH") return u;
    return "GRAM";
  };

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
        row.estimatedCostCents != null && row.estimatedCostCents > 0
          ? `≈ ${formatDollars(row.estimatedCostCents)}`
          : undefined;
      return {
        id: row.ingredientId,
        primaryText: `${row.name} — ${quantityText}`,
        badge: row.anyOptional ? "optional" : undefined,
        secondaryText,
      };
    });
  }, [totals, mode]);

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
      {totals.length > 0 && (
        <div className="mt-6">
          <h2 className="text-lg font-medium text-foreground">
            Summation calculations
          </h2>
          <table className="mt-2 w-full border-collapse border border-border text-sm">
            <thead>
              <tr className="bg-muted">
                <th className="border border-border px-3 py-2 text-left font-medium">
                  Ingredient
                </th>
                <th className="border border-border px-3 py-2 text-left font-medium">
                  Calculation
                </th>
                <th className="border border-border px-3 py-2 text-left font-medium">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {totals.map((row) => {
                const hasSources =
                  row.sources && row.sources.length > 0;
                const totalText =
                  mode === "kitchen"
                    ? formatCanonicalForKitchen(
                        row.totalBasisQty,
                        row.basisUnitLabel
                      )
                    : toDisplayUnits({
                        canonicalQty: row.totalBasisQty,
                        canonicalUnit: canonicalUnit(row.basisUnit),
                        ingredient: {
                          preferredDisplayUnit:
                            row.preferredDisplayUnit as DisplayPreference,
                          gramsPerCup: row.gramsPerCup,
                        },
                      }).displayText;
                return (
                  <tr key={row.ingredientId}>
                    <td className="border border-border px-3 py-2">
                      {row.name}
                      {row.anyOptional && (
                        <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          optional
                        </span>
                      )}
                    </td>
                    <td className="border border-border px-3 py-2 text-muted-foreground">
                      {hasSources ? (
                        <ul className="list-none space-y-1 pl-0">
                          {row.sources!.map((s, i) => {
                            const amount = formatSourceAmount(
                              s,
                              row.basisUnitLabel
                            );
                            const label = s.recipeTitle ?? "Recipe";
                            return (
                              <li key={i}>
                                {s.recipeId ? (
                                  <Link
                                    href={`/recipes/${s.recipeId}`}
                                    className="text-primary underline-offset-4 hover:underline"
                                  >
                                    {label}
                                  </Link>
                                ) : (
                                  <span>{label}</span>
                                )}
                                {": "}
                                {amount}
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="border border-border px-3 py-2">
                      {totalText}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
