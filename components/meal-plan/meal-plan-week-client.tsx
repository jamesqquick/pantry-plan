"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GroceryListDisplay } from "@/components/orders/grocery-list-display";
import type { CanonicalUnitLabel } from "@/lib/grocery/display-units";
import { GroceryActions } from "@/components/grocery/grocery-actions";
import { type PlannedMealItem } from "./planned-meal-slot";
import { AddOrEditMealModal } from "./add-or-edit-meal-modal";
import { MealPlanDayCard } from "./meal-plan-day-card";
import { MealTypeLegend } from "./meal-type-legend";
import { Toast } from "@/components/ui/toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { movePlannedMealAction } from "@/app/actions/meal-plan.actions";
import { PrimaryList } from "@/components/ui/primary-list";

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
  sources?: Array<{
    recipeId: string;
    recipeTitle: string;
    qty: number;
    unit: string | null;
    batches: number;
    basisQty: number | null;
  }>;
};

type GroceryLine = { name: string; totalText: string; optional?: boolean };

type GroceryIssues = {
  unmapped: Array<{
    recipeId: string;
    recipeTitle: string;
    displayText: string;
  }>;
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
    unit: string | null;
    basisUnit: string;
    reason: string;
  }>;
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
  onRefresh,
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
  onRefresh?: () => void;
}) {
  const router = useRouter();
  const refresh = onRefresh ?? (() => router.refresh());

  const [optimisticPlannedMeals, setOptimisticPlannedMeals] = useState<
    PlannedMealItem[] | null
  >(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const lastMoveRef = useRef<{ mealId: string; targetDate: string } | null>(
    null,
  );

  const displayMeals = optimisticPlannedMeals ?? plannedMeals;
  const plannedByKey = useMemo(() => {
    const map = new Map<string, PlannedMealItem[]>();
    for (const p of displayMeals) {
      const list = map.get(p.date) ?? [];
      list.push(p);
      map.set(p.date, list);
    }
    return map;
  }, [displayMeals]);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [modalDate, setModalDate] = useState(weekDates[0] ?? weekStart);
  const [modalSlot, setModalSlot] = useState("DINNER");
  const [modalInitialMeal, setModalInitialMeal] =
    useState<PlannedMealItem | null>(null);

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
    refresh();
  }, [refresh]);

  const [draggingMeal, setDraggingMeal] = useState<{
    id: string;
    date: string;
    mealSlot: string;
  } | null>(null);

  const handleMoveMeal = useCallback(
    async (mealId: string, targetDate: string, mealSlot: string) => {
      const currentMeals = optimisticPlannedMeals ?? plannedMeals;
      const movedMeals = currentMeals.map((m) =>
        m.id === mealId ? { ...m, date: targetDate } : m,
      );
      setOptimisticPlannedMeals(movedMeals);
      setMoveError(null);

      const formData = new FormData();
      formData.set("id", mealId);
      formData.set("date", targetDate);
      formData.set("mealSlot", mealSlot);
      const result = await movePlannedMealAction(null, formData);

      if (result.ok) {
        lastMoveRef.current = { mealId, targetDate };
        refresh();
      } else {
        setOptimisticPlannedMeals(null);
        setMoveError(
          result.error?.message ?? "Something went wrong. The meal was moved back.",
        );
      }
      return result;
    },
    [plannedMeals, optimisticPlannedMeals, refresh],
  );

  useEffect(() => {
    const pending = lastMoveRef.current;
    if (!pending || !optimisticPlannedMeals) return;
    const serverHasMove = plannedMeals.some(
      (m) => m.id === pending.mealId && m.date === pending.targetDate,
    );
    if (serverHasMove) {
      setOptimisticPlannedMeals(null);
      lastMoveRef.current = null;
    }
  }, [plannedMeals, optimisticPlannedMeals]);

  useEffect(() => {
    if (!moveError) return;
    const t = setTimeout(() => setMoveError(null), 4000);
    return () => clearTimeout(t);
  }, [moveError]);

  const hasRecipeMeals = displayMeals.some((p) => p.recipeId != null);

  const recipesInPlan = useMemo(() => {
    const seen = new Set<string>();
    const list: { id: string; title: string }[] = [];
    for (const m of displayMeals) {
      if (m.recipeId && m.recipe && !seen.has(m.recipe.id)) {
        seen.add(m.recipe.id);
        list.push({ id: m.recipe.id, title: m.recipe.title });
      }
    }
    return list.sort((a, b) => a.title.localeCompare(b.title));
  }, [displayMeals]);

  const getMealsForDay = useCallback(
    (date: string) => {
      const meals = plannedByKey.get(date) ?? [];
      return [...meals].sort(
        (a, b) =>
          MEAL_SLOTS.indexOf(a.mealSlot as (typeof MEAL_SLOTS)[number]) -
          MEAL_SLOTS.indexOf(b.mealSlot as (typeof MEAL_SLOTS)[number])
      );
    },
    [plannedByKey]
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Meals this week</CardTitle>
          <CardDescription>
            Add or move meals by day. Drag a meal to another day to reschedule.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="overflow-x-auto"
            aria-label="Weekly meal grid"
          >
            <div className="grid grid-cols-1 gap-2 min-[1024px]:grid-cols-[repeat(7,minmax(0,160px))] min-[1024px]:min-w-[280px]">
              {weekDates.map((date) => (
                <div
                  key={date}
                  className="mx-auto w-full max-w-[600px] min-[1024px]:mx-0 min-[1024px]:max-w-none"
                >
                  <MealPlanDayCard
                    date={date}
                    meals={getMealsForDay(date)}
                    onAdd={() => openAddModal(date, "DINNER")}
                    onEdit={openEditModal}
                    onMoveMeal={handleMoveMeal}
                    draggingMeal={draggingMeal}
                    onDragStart={(meal) =>
                      setDraggingMeal({
                        id: meal.id,
                        date: meal.date,
                        mealSlot: meal.mealSlot,
                      })
                    }
                    onDragEnd={() => setDraggingMeal(null)}
                  />
                </div>
              ))}
            </div>
          </div>
          <MealTypeLegend />
        </CardContent>
      </Card>

      {hasRecipeMeals && recipesInPlan.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>This week&apos;s recipes</CardTitle>
            <CardDescription>
              Open a recipe to view details or edit ingredients.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PrimaryList
              items={recipesInPlan.map((r) => ({
                id: r.id,
                primaryText: r.title,
                href: `/recipes/${r.id}`,
              }))}
              aria-label="This week's recipes"
            />
          </CardContent>
        </Card>
      )}

      {(hasRecipeMeals || displayMeals.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Grocery list</CardTitle>
            <CardDescription>
              {hasRecipeMeals
                ? "Based on the recipes you’ve planned above. Change the plan to update the list."
                : "Add recipe-based meals above to generate a merged grocery list."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {hasRecipeMeals ? (
              <>
                <GroceryListDisplay
                  totals={groceryTotals}
                  title=""
                  showCostEstimates={false}
                  actions={
                    groceryLines.length > 0 ? (
                      <GroceryActions
                        lines={groceryLines}
                        title="Grocery list"
                      />
                    ) : undefined
                  }
                />
                {groceryIssues &&
                  (groceryIssues.unmapped.length > 0 ||
                    groceryIssues.missingQuantityOrUnit.length > 0) && (
                    <p className="text-sm text-muted-foreground">
                      Some ingredients may be missing or unmapped; totals can be
                      less precise until recipe ingredients are enhanced.
                    </p>
                  )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Add recipe-based meals to generate a grocery list. Custom
                entries (e.g. leftovers, takeout) don’t include ingredients.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <AddOrEditMealModal
        key={modalOpen ? `add-edit-${modalDate}-${modalSlot}` : "add-edit-closed"}
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
      {moveError && (
        <Toast message={moveError} variant="error" />
      )}
    </>
  );
}
