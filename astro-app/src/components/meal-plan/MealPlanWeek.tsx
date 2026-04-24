import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { actions } from "astro:actions";
import { softNavigate } from "@/lib/navigate";
import { MealPlanDayCard } from "./MealPlanDayCard";
import { MealTypeLegend } from "./MealTypeLegend";
import { AddOrEditMealModal } from "./AddOrEditMealModal";
import { GroceryListDisplay } from "@/components/orders/GroceryListDisplay";
import type { GroceryListResult } from "@/lib/grocery/aggregate";
import type { PlannedMealItem, RecipeOption } from "./meal-plan-types";
import type { MealSlot } from "@/db/schema/enums";

const MEAL_SLOTS: MealSlot[] = ["BREAKFAST", "LUNCH", "DINNER"];

export function MealPlanWeek({
  weekStart,
  weekDates,
  plannedMeals: serverMeals,
  recipeOptions,
  grocery,
  initialAddRecipeId,
}: {
  weekStart: string;
  weekDates: string[];
  plannedMeals: PlannedMealItem[];
  recipeOptions: RecipeOption[];
  grocery: GroceryListResult;
  initialAddRecipeId?: string;
}) {
  // ------- Optimistic drag-and-drop state -------
  const [optimisticMeals, setOptimisticMeals] = useState<PlannedMealItem[] | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const lastMoveRef = useRef<{ mealId: string; targetDate: string } | null>(null);

  const displayMeals = optimisticMeals ?? serverMeals;

  const plannedByKey = useMemo(() => {
    const map = new Map<string, PlannedMealItem[]>();
    for (const p of displayMeals) {
      const list = map.get(p.date) ?? [];
      list.push(p);
      map.set(p.date, list);
    }
    return map;
  }, [displayMeals]);

  // ------- Modal state -------
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [modalDate, setModalDate] = useState(weekDates[0] ?? weekStart);
  const [modalSlot, setModalSlot] = useState<string>("DINNER");
  const [modalInitialMeal, setModalInitialMeal] = useState<PlannedMealItem | null>(null);
  const [modalInstanceId, setModalInstanceId] = useState(0);

  // Auto-open from ?addRecipe= deep link.
  const skipAddRecipeAutoOpenRef = useRef(false);
  useEffect(() => {
    if (!initialAddRecipeId) {
      skipAddRecipeAutoOpenRef.current = false;
    }
    if (initialAddRecipeId && weekDates.length > 0 && !modalOpen) {
      if (skipAddRecipeAutoOpenRef.current) return;
      setModalMode("add");
      setModalDate(weekDates[0]!);
      setModalSlot("DINNER");
      setModalInitialMeal(null);
      setModalInstanceId((n) => n + 1);
      setModalOpen(true);
    }
  }, [initialAddRecipeId, weekDates, modalOpen]);

  const openAddModal = useCallback(
    (date: string, mealSlot: string) => {
      setModalMode("add");
      setModalDate(date);
      setModalSlot(mealSlot);
      setModalInitialMeal(null);
      setModalInstanceId((n) => n + 1);
      setModalOpen(true);
    },
    [],
  );

  const openEditModal = useCallback((meal: PlannedMealItem) => {
    setModalMode("edit");
    setModalDate(meal.date);
    setModalSlot(meal.mealSlot);
    setModalInitialMeal(meal);
    setModalInstanceId((n) => n + 1);
    setModalOpen(true);
  }, []);

  const handleModalSuccess = useCallback(() => {
    if (initialAddRecipeId) {
      skipAddRecipeAutoOpenRef.current = true;
      // Strip ?addRecipe= from URL without a full navigation.
      window.history.replaceState({}, "", `/meal-plan/${weekStart}`);
    }
    // Soft-navigate to refresh server-rendered data with view transition.
    softNavigate(`/meal-plan/${weekStart}`);
  }, [initialAddRecipeId, weekStart]);

  // ------- Drag-and-drop -------
  const [draggingMeal, setDraggingMeal] = useState<{
    id: string;
    date: string;
    mealSlot: string;
  } | null>(null);

  const handleMoveMeal = useCallback(
    async (mealId: string, targetDate: string, mealSlot: string) => {
      const currentMeals = optimisticMeals ?? serverMeals;
      const movedMeals = currentMeals.map((m) =>
        m.id === mealId ? { ...m, date: targetDate } : m,
      );
      setOptimisticMeals(movedMeals);
      setMoveError(null);

      const { error } = await actions.mealPlan.move({
        id: mealId,
        date: targetDate,
        mealSlot: mealSlot as MealSlot,
      });

      if (!error) {
        lastMoveRef.current = { mealId, targetDate };
        // Soft-navigate to get updated server data (including grocery recalculation).
        softNavigate(`/meal-plan/${weekStart}`);
      } else {
        setOptimisticMeals(null);
        setMoveError(error.message ?? "Something went wrong. The meal was moved back.");
      }
    },
    [serverMeals, optimisticMeals, weekStart],
  );

  // Auto-dismiss move error toast.
  useEffect(() => {
    if (!moveError) return;
    const t = setTimeout(() => setMoveError(null), 4000);
    return () => clearTimeout(t);
  }, [moveError]);

  // ------- Derived data -------
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
          MEAL_SLOTS.indexOf(a.mealSlot as MealSlot) -
          MEAL_SLOTS.indexOf(b.mealSlot as MealSlot),
      );
    },
    [plannedByKey],
  );

  return (
    <div className="space-y-8">
      {/* Weekly grid */}
      <section className="rounded-lg border border-border bg-card shadow-sm">
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-display text-xl text-primary-on-background">
            Meals this week
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add or move meals by day. Drag a meal to another day to reschedule.
          </p>
        </div>
        <div className="space-y-4 p-6">
          <div className="overflow-x-auto" aria-label="Weekly meal grid">
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
        </div>
      </section>

      {/* This week's recipes */}
      {hasRecipeMeals && recipesInPlan.length > 0 && (
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <div className="border-b border-border px-6 py-4">
            <h2 className="font-display text-xl text-primary-on-background">
              This week's recipes
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Open a recipe to view details or edit ingredients.
            </p>
          </div>
          <ul className="divide-y divide-border">
            {recipesInPlan.map((r) => (
              <li key={r.id}>
                <a
                  href={`/recipes/${r.id}`}
                  className="flex cursor-pointer items-center px-6 py-3 text-sm font-medium text-card-foreground transition-colors hover:bg-primary/5 hover:text-primary-on-card"
                >
                  {r.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Grocery list */}
      {(hasRecipeMeals || displayMeals.length > 0) && (
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <div className="border-b border-border px-6 py-4">
            <h2 className="font-display text-xl text-primary-on-background">
              Grocery list
              {grocery.totals.length > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({grocery.totals.length} items)
                </span>
              )}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasRecipeMeals
                ? "Based on the recipes you've planned above. Change the plan to update the list."
                : "Add recipe-based meals above to generate a merged grocery list."}
            </p>
          </div>
          <div className="p-6">
            {hasRecipeMeals ? (
              <GroceryListDisplay grocery={grocery} showCost={true} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Add recipe-based meals to generate a grocery list. Custom entries
                (e.g. leftovers, takeout) don't include ingredients.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Modal */}
      <AddOrEditMealModal
        key={modalOpen ? `modal-${modalInstanceId}` : "modal-closed"}
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

      {/* Move error toast */}
      {moveError && (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-destructive/30 bg-destructive px-4 py-3 text-sm font-medium text-destructive-foreground shadow-lg"
        >
          {moveError}
        </div>
      )}
    </div>
  );
}
