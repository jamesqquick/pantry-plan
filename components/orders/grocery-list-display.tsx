"use client";

import {
  useMemo,
  useOptimistic,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { GroceryDisplayToggle } from "./grocery-display-toggle";
import {
  toDisplayUnits,
  formatCanonicalForKitchen,
  type CanonicalUnit,
  type DisplayPreference,
  type CanonicalUnitLabel,
} from "@/lib/grocery/display-units";
import { PrimaryList, type PrimaryListItem } from "@/components/ui/primary-list";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toggleOrderGroceryItemCheckedAction } from "@/app/actions/orders.actions";

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

function formatDollars(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

type ChecklistProps = {
  orderId: string;
  checkedIngredientIds: string[];
};

function GroceryChecklistRows({
  items,
  orderId,
  checkedIngredientIds,
}: {
  items: PrimaryListItem[];
  orderId: string;
  checkedIngredientIds: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimisticChecked, setOptimisticChecked] = useOptimistic(
    checkedIngredientIds,
    (current, next: { ingredientId: string; checked: boolean }) => {
      const set = new Set(current);
      if (next.checked) set.add(next.ingredientId);
      else set.delete(next.ingredientId);
      return [...set];
    },
  );

  const checkedSet = new Set(optimisticChecked);

  const onToggle = (ingredientId: string, nextChecked: boolean) => {
    startTransition(async () => {
      setOptimisticChecked({ ingredientId, checked: nextChecked });
      const result = await toggleOrderGroceryItemCheckedAction({
        orderId,
        ingredientId,
        checked: nextChecked,
      });
      if (!result.ok) {
        router.refresh();
      }
    });
  };

  return (
    <ul
      className="divide-y divide-border overflow-hidden rounded-input border border-border bg-card"
      aria-label="Grocery list"
    >
      {items.map((item) => {
        const isChecked = checkedSet.has(item.id);
        const controlId = `grocery-check-${orderId}-${item.id}`;
        return (
          <li key={item.id}>
            <div
              className={cn(
                "flex min-h-14 flex-wrap items-center gap-3 px-4 py-3 text-foreground",
                isChecked && "bg-muted/40",
              )}
            >
              <Checkbox
                id={controlId}
                checked={isChecked}
                disabled={pending}
                onCheckedChange={(state) => {
                  if (state === "indeterminate") return;
                  onToggle(item.id, state === true);
                }}
              />
              <Label
                htmlFor={controlId}
                className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 font-normal"
              >
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  <span
                    className={cn(
                      isChecked && "text-muted-foreground line-through decoration-muted-foreground/70",
                    )}
                  >
                    {item.primaryText}
                  </span>
                  {item.badge != null && item.badge !== "" && (
                    <span
                      className="rounded-full bg-accent px-2 py-0.5 text-xs font-normal text-accent-foreground"
                      aria-hidden
                    >
                      {item.badge}
                    </span>
                  )}
                </span>
                {item.secondaryText != null && item.secondaryText !== "" && (
                  <span className="text-sm text-muted-foreground">{item.secondaryText}</span>
                )}
              </Label>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function GroceryListDisplay({
  totals,
  title,
  actions,
  showCostEstimates = true,
  checklist,
}: {
  totals: GroceryRow[];
  title?: string;
  actions?: ReactNode;
  /** When false, per-ingredient cost estimates are hidden (e.g. on meal planner). */
  showCostEstimates?: boolean;
  /** When set (order detail), grocery lines become a persisted checklist. */
  checklist?: ChecklistProps;
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
          {checklist ? (
            <GroceryChecklistRows
              items={listItems}
              orderId={checklist.orderId}
              checkedIngredientIds={checklist.checkedIngredientIds}
            />
          ) : (
            <PrimaryList
              items={listItems}
              aria-label="Grocery list"
            />
          )}
        </div>
      )}
    </section>
  );
}
