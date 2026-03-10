"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { AppIcon } from "@/components/ui/icons";
import { ContentLink } from "@/components/ui/content-link";

export type PlannedMealItem = {
  id: string;
  date: string;
  mealSlot: string;
  recipeId: string | null;
  customLabel: string | null;
  servings: number | null;
  recipe: { id: string; title: string } | null;
};

const SLOT_LABELS: Record<string, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
};

export function PlannedMealSlot({
  date,
  mealSlot,
  meal,
  onAdd,
  onEdit,
  onRemove,
  compact,
}: {
  date: string;
  mealSlot: string;
  meal: PlannedMealItem | null;
  onAdd?: () => void;
  onEdit: () => void;
  onRemove: () => void;
  compact?: boolean;
}) {
  const slotLabel = SLOT_LABELS[mealSlot] ?? mealSlot;
  const isEmpty = !meal;

  return (
    <div
      className={cn(
        "flex flex-col rounded-input border border-border bg-card p-2 transition-colors",
        compact ? "min-h-[4rem]" : "min-h-[5.5rem]"
      )}
    >
      {!compact && (
        <span className="text-xs font-medium text-muted-foreground">{slotLabel}</span>
      )}
      {isEmpty ? (
        onAdd ? (
          <button
            type="button"
            onClick={onAdd}
            className={cn(
              "mt-1 flex flex-1 cursor-pointer items-center justify-center gap-1 rounded-input border border-dashed border-muted-foreground/40 bg-muted/30 text-muted-foreground hover:border-muted-foreground/60 hover:bg-muted/50 hover:text-foreground",
              compact ? "min-h-[2.5rem] text-xs" : "min-h-[3.5rem] text-sm"
            )}
            aria-label={`Add meal for ${slotLabel}`}
          >
            <AppIcon name="add" size={compact ? 14 : 16} aria-hidden />
            Add
          </button>
        ) : (
          <div
            className={cn(
              "mt-1 flex flex-1 items-center justify-center rounded-input border border-dashed border-muted-foreground/30 bg-muted/10 text-muted-foreground",
              compact ? "min-h-[2.5rem] text-xs" : "min-h-[3.5rem] text-sm"
            )}
            aria-hidden
          >
            —
          </div>
        )
      ) : (
        <div className="mt-1 flex flex-1 flex-col gap-1">
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0 flex-1">
              {meal.recipeId && meal.recipe ? (
                <ContentLink
                  href={`/recipes/${meal.recipe.id}`}
                  className="line-clamp-2 text-sm font-medium text-foreground"
                >
                  {meal.recipe.title}
                </ContentLink>
              ) : (
                <span className="line-clamp-2 text-sm font-medium text-foreground">
                  {meal.customLabel ?? "—"}
                </span>
              )}
            </div>
            <div className="flex shrink-0 gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={onEdit}
                aria-label="Edit meal"
              >
                <AppIcon name="edit" size={14} aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={onRemove}
                aria-label="Remove from plan"
              >
                <AppIcon name="delete" size={14} aria-hidden />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
