import { useState, useCallback } from "react";
import { MEAL_SLOT_SWATCH } from "./MealTypeLegend";
import type { PlannedMealItem } from "./meal-plan-types";
import { cn } from "@/lib/utils";

const SLOT_LABELS: Record<string, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
};

type DraggingMeal = { id: string; date: string; mealSlot: string } | null;

export function MealPlanDayCard({
  date,
  meals,
  onAdd,
  onEdit,
  onMoveMeal,
  draggingMeal,
  onDragStart,
  onDragEnd,
}: {
  date: string;
  meals: PlannedMealItem[];
  onAdd: () => void;
  onEdit: (meal: PlannedMealItem) => void;
  onMoveMeal?: (mealId: string, targetDate: string, mealSlot: string) => Promise<unknown>;
  draggingMeal?: DraggingMeal;
  onDragStart?: (meal: PlannedMealItem) => void;
  onDragEnd?: () => void;
}) {
  const [isDragOver, setIsDragOver] = useState(false);
  const d = new Date(date + "T12:00:00");
  const dayAbbr = d.toLocaleDateString("en-US", { weekday: "short" });
  const dayNum = d.getUTCDate();

  const canDrop = draggingMeal && draggingMeal.date !== date;

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (canDrop) {
        e.dataTransfer.dropEffect = "move";
        setIsDragOver(true);
      } else {
        e.dataTransfer.dropEffect = "none";
      }
    },
    [canDrop],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (canDrop && draggingMeal && onMoveMeal) {
        void onMoveMeal(draggingMeal.id, date, draggingMeal.mealSlot);
      }
    },
    [canDrop, draggingMeal, date, onMoveMeal],
  );

  const handleMealDragStart = useCallback(
    (e: React.DragEvent, meal: PlannedMealItem) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(
        "application/json",
        JSON.stringify({ id: meal.id, date: meal.date, mealSlot: meal.mealSlot }),
      );
      e.dataTransfer.setData(
        "text/plain",
        meal.recipe?.title ?? meal.customLabel ?? "Meal",
      );
      onDragStart?.(meal);
    },
    [onDragStart],
  );

  return (
    <article
      className={cn(
        "flex min-h-[14rem] min-w-0 w-full flex-col rounded-input border border-border bg-card p-3 shadow-sm transition-colors",
        isDragOver && canDrop && "border-primary bg-primary/10 ring-2 ring-primary/30",
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <header className="mb-2 text-center">
        <p className="text-base font-bold text-foreground">{dayAbbr}</p>
        <p className="text-sm text-muted-foreground">{dayNum}</p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {meals.map((meal) => {
          const swatch = MEAL_SLOT_SWATCH[meal.mealSlot] ?? "bg-muted text-muted-foreground";
          const slotLabel = SLOT_LABELS[meal.mealSlot] ?? meal.mealSlot;
          const title =
            meal.recipeId && meal.recipe ? meal.recipe.title : (meal.customLabel ?? "\u2014");

          return (
            <button
              key={meal.id}
              type="button"
              draggable
              onClick={() => onEdit(meal)}
              onDragStart={(e) => handleMealDragStart(e, meal)}
              onDragEnd={() => onDragEnd?.()}
              className={cn(
                "flex w-full cursor-grab active:cursor-grabbing items-start gap-1 rounded-input px-2 py-1.5 text-left transition-opacity hover:opacity-90",
                swatch,
              )}
              aria-label={`Edit ${title} (${slotLabel}). Drag to move to another day.`}
            >
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium" title={title}>
                  {title}
                </span>
                <p className="text-xs opacity-90">{slotLabel}</p>
              </div>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onAdd}
        className="mt-2 w-full cursor-pointer rounded-input border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
        aria-label={`Add meal for ${dayAbbr}`}
      >
        {/* Lucide Plus */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mr-1 inline-block h-3.5 w-3.5"
          aria-hidden
        >
          <path d="M5 12h14" />
          <path d="M12 5v14" />
        </svg>
        Add
      </button>
    </article>
  );
}
