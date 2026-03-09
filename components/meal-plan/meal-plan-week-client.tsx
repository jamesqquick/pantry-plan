"use client";

import { useCallback, useEffect, useMemo, useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageTitle } from "@/components/ui/page-title";
import { Button } from "@/components/ui/button";
import { AppIcon } from "@/components/ui/icons";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { GroceryListDisplay } from "@/components/orders/grocery-list-display";
import type { CanonicalUnitLabel } from "@/lib/grocery/display-units";
import { GroceryActions } from "@/components/grocery/grocery-actions";
import { PlannedMealSlot, type PlannedMealItem } from "./planned-meal-slot";
import { AddOrEditMealModal } from "./add-or-edit-meal-modal";
import { prevWeek, nextWeek } from "@/lib/meal-plan/week-dates";
import { deletePlannedMealAction } from "@/app/actions/meal-plan.actions";
import { cn } from "@/lib/cn";

const MEAL_SLOTS = ["BREAKFAST", "LUNCH", "DINNER"] as const;

type GroceryTotalRow = {
  ingredientId: string;
  name: string;
  basisUnit: string;
  basisUnitLabel: CanonicalUnitLabel;
  totalBasisQty: number;
  estimatedCostCents: number | null;
  anyOptional: boolean;
  preferredDisplayUnit: string;
  gramsPerCup: number | null;
  sources?: Array<{ recipeId: string; recipeTitle: string; qty: number; unit: string | null; batches: number; basisQty: number | null }>;
};

type GroceryLine = { name: string; totalText: string; optional?: boolean };

type GroceryIssues = {
  unmapped: Array<{ recipeId: string; recipeTitle: string; displayText: string }>;
  missingQuantityOrUnit: Array<{ recipeId: string; recipeTitle: string; displayText: string }>;
  cannotConvert: Array<{ recipeId: string; recipeTitle: string; ingredientName?: string; displayText: string; quantity: number | null; unit: string | null; basisUnit: string; reason: string }>;
  missingCost: Array<{ ingredientId: string; name: string }>;
};

export function MealPlanWeekClient({
  weekStart,
  weekDates,
  plannedMeals,
  recipeOptions,
  groceryTotals,
  groceryLines,
  groceryIssues,
  totalEstimatedCostCents,
  initialAddRecipeId,
}: {
  weekStart: string;
  weekDates: string[];
  plannedMeals: PlannedMealItem[];
  recipeOptions: { id: string; title: string }[];
  groceryTotals: GroceryTotalRow[];
  groceryLines: GroceryLine[];
  groceryIssues?: GroceryIssues;
  totalEstimatedCostCents: number;
  initialAddRecipeId?: string;
}) {
  const router = useRouter();
  const plannedByKey = useMemo(() => {
    const map = new Map<string, PlannedMealItem>();
    for (const p of plannedMeals) {
      map.set(`${p.date}-${p.mealSlot}`, p);
    }
    return map;
  }, [plannedMeals]);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [modalDate, setModalDate] = useState(weekDates[0] ?? weekStart);
  const [modalSlot, setModalSlot] = useState("DINNER");
  const [modalInitialMeal, setModalInitialMeal] = useState<PlannedMealItem | null>(null);
  const [removeMealId, setRemoveMealId] = useState<string | null>(null);
  const [deleteState, deleteFormAction] = useActionState(deletePlannedMealAction, null);

  useEffect(() => {
    if (deleteState?.ok) {
      setRemoveMealId(null);
      router.refresh();
    }
  }, [deleteState, router]);

  useEffect(() => {
    if (initialAddRecipeId && weekDates.length > 0 && !modalOpen) {
      setModalMode("add");
      setModalDate(weekDates[0]!);
      setModalSlot("DINNER");
      setModalInitialMeal(null);
      setModalOpen(true);
    }
  }, [initialAddRecipeId, weekDates, modalOpen]);

  const openAddModal = useCallback((date: string, mealSlot: string) => {
    setModalMode("add");
    setModalDate(date);
    setModalSlot(mealSlot);
    setModalInitialMeal(null);
    setModalOpen(true);
  }, []);

  const openEditModal = useCallback((meal: PlannedMealItem) => {
    setModalMode("edit");
    setModalDate(meal.date);
    setModalSlot(meal.mealSlot);
    setModalInitialMeal(meal);
    setModalOpen(true);
  }, []);

  const handleModalSuccess = useCallback(() => {
    router.refresh();
  }, [router]);

  const weekStartDate = new Date(weekStart + "T12:00:00");
  const titleText = `Week of ${weekStartDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  const prevWeekStart = prevWeek(weekStart);
  const nextWeekStart = nextWeek(weekStart);
  const hasRecipeMeals = plannedMeals.some((p) => p.recipeId != null);

  return (
    <>
      <div className="space-y-4">
        <Link
          href="/meal-plan"
          className="inline-block text-sm text-muted-foreground hover:text-foreground"
        >
          ← Meal plan
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <PageTitle>{titleText}</PageTitle>
            <nav className="flex gap-1" aria-label="Previous and next week">
              <Link
                href={`/meal-plan/${prevWeekStart}`}
                className="inline-flex size-9 items-center justify-center rounded-input border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Previous week"
              >
                <AppIcon name="back" size={18} aria-hidden />
              </Link>
              <Link
                href={`/meal-plan/${nextWeekStart}`}
                className="inline-flex size-9 items-center justify-center rounded-input border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Next week"
              >
                <span className="sr-only">Next</span>
                <AppIcon name="back" size={18} className="rotate-180" aria-hidden />
              </Link>
            </nav>
          </div>
        </div>
      </div>

      {plannedMeals.length === 0 ? (
        <div className="rounded-input border border-dashed border-border bg-muted/20 p-8 text-center">
          <p className="text-muted-foreground">
            No meals planned for this week yet.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Click any slot below to add a recipe or a custom meal (e.g. leftovers, takeout).
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Plan your week, then generate a grocery list from your recipes.
          </p>
        </div>
      ) : null}

      <section aria-label="Weekly meal grid">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse">
            <thead>
              <tr>
                <th scope="col" className="w-0 border-b border-border pb-2 text-left text-xs font-medium text-muted-foreground">
                  Meal
                </th>
                {weekDates.map((d) => (
                  <th
                    key={d}
                    scope="col"
                    className="border-b border-border px-1 pb-2 text-center text-xs font-medium text-muted-foreground"
                  >
                    {new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MEAL_SLOTS.map((slot) => (
                <tr key={slot}>
                  <td className="border-b border-border py-1 pr-2 text-left text-xs font-medium text-muted-foreground">
                    {slot === "BREAKFAST" ? "Breakfast" : slot === "LUNCH" ? "Lunch" : "Dinner"}
                  </td>
                  {weekDates.map((date) => {
                    const key = `${date}-${slot}`;
                    const meal = plannedByKey.get(key) ?? null;
                    return (
                      <td key={key} className="border-b border-border p-1 align-top">
                        <PlannedMealSlot
                          date={date}
                          mealSlot={slot}
                          meal={meal}
                          onAdd={() => openAddModal(date, slot)}
                          onEdit={() => meal && openEditModal(meal)}
                          onRemove={() => meal && setRemoveMealId(meal.id)}
                          compact
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {hasRecipeMeals && (
        <section className="space-y-2">
          <h2 className="text-lg font-medium text-foreground">
            Grocery list for this week
          </h2>
          <p className="text-sm text-muted-foreground">
            Based on the recipes you’ve planned above. Change the plan to update the list.
          </p>
          <GroceryListDisplay
            totals={groceryTotals}
            title=""
            actions={
              groceryLines.length > 0 ? (
                <GroceryActions
                  lines={groceryLines}
                  title="Grocery list"
                />
              ) : undefined
            }
          />
          {groceryTotals.length > 0 && totalEstimatedCostCents > 0 && (
            <p className="text-sm font-medium text-foreground">
              Estimated total: {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(totalEstimatedCostCents / 100)}
            </p>
          )}
          {groceryIssues && (groceryIssues.unmapped.length > 0 || groceryIssues.missingQuantityOrUnit.length > 0) && (
            <p className="text-sm text-muted-foreground">
              Some ingredients may be missing or unmapped; totals can be less precise until recipe ingredients are enhanced.
            </p>
          )}
        </section>
      )}

      {!hasRecipeMeals && plannedMeals.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Add recipe-based meals to generate a grocery list. Custom entries (e.g. leftovers, takeout) don’t include ingredients.
        </p>
      )}

      <AddOrEditMealModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        mode={modalMode}
        initialDate={modalDate}
        initialMealSlot={modalSlot}
        initialMeal={modalInitialMeal}
        initialRecipeIdForAdd={initialAddRecipeId}
        recipeOptions={recipeOptions}
        weekDates={weekDates}
        onSuccess={handleModalSuccess}
      />

      <form
        id="delete-meal-form"
        action={deleteFormAction}
        className="hidden"
      >
        {removeMealId != null && (
          <input type="hidden" name="id" value={removeMealId} />
        )}
      </form>
      <ConfirmDialog
        open={removeMealId != null}
        onOpenChange={(open) => !open && setRemoveMealId(null)}
        title="Remove meal"
        description="This meal will be removed from your plan."
        confirmLabel="Remove"
        confirmVariant="danger"
        onConfirm={() => {
          (document.getElementById("delete-meal-form") as HTMLFormElement | null)?.requestSubmit();
          setRemoveMealId(null);
        }}
      />
    </>
  );
}
