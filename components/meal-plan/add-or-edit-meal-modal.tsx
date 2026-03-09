"use client";

import { useState, useEffect } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppIcon } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import {
  upsertPlannedMealAction,
  updatePlannedMealAction,
  deletePlannedMealAction,
} from "@/app/actions/meal-plan.actions";
import type { PlannedMealItem } from "./planned-meal-slot";

const MEAL_SLOTS = [
  { value: "BREAKFAST", label: "Breakfast" },
  { value: "LUNCH", label: "Lunch" },
  { value: "DINNER", label: "Dinner" },
] as const;

const CUSTOM_PLACEHOLDERS = [
  "Leftovers",
  "Takeout",
  "Dinner out",
  "Family event",
  "Meal prep",
  "TBD",
];

type RecipeOption = { id: string; title: string };

export function AddOrEditMealModal({
  open,
  onClose,
  mode,
  initialDate,
  initialMealSlot,
  initialMeal,
  initialRecipeIdForAdd,
  recipeOptions,
  weekDates,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  mode: "add" | "edit";
  initialDate: string;
  initialMealSlot: string;
  initialMeal: PlannedMealItem | null;
  initialRecipeIdForAdd?: string;
  recipeOptions: RecipeOption[];
  weekDates: string[];
  onSuccess: () => void;
}) {
  const [useRecipe, setUseRecipe] = useState(mode === "add" ? true : (initialMeal?.recipeId != null));
  const [recipeId, setRecipeId] = useState(initialMeal?.recipeId ?? initialRecipeIdForAdd ?? "");
  const [customLabel, setCustomLabel] = useState(initialMeal?.customLabel ?? "");
  const [servings, setServings] = useState(String(initialMeal?.servings ?? 4));
  const [date, setDate] = useState(initialDate);
  const [mealSlot, setMealSlot] = useState(initialMealSlot);
  const [search, setSearch] = useState("");
  const [filteredRecipes, setFilteredRecipes] = useState(recipeOptions);

  useEffect(() => {
    if (!search.trim()) {
      setFilteredRecipes(recipeOptions.slice(0, 50));
      return;
    }
    const q = search.toLowerCase();
    setFilteredRecipes(
      recipeOptions.filter((r) => r.title.toLowerCase().includes(q)).slice(0, 50)
    );
  }, [search, recipeOptions]);

  useEffect(() => {
    if (!open) return;
    setUseRecipe(mode === "add" ? true : (initialMeal?.recipeId != null));
    setRecipeId(initialMeal?.recipeId ?? initialRecipeIdForAdd ?? "");
    setCustomLabel(initialMeal?.customLabel ?? "");
    setServings(String(initialMeal?.servings ?? 4));
    setDate(initialDate);
    setMealSlot(initialMealSlot);
  }, [open, mode, initialDate, initialMealSlot, initialMeal, initialRecipeIdForAdd]);

  const [upsertState, upsertFormAction] = useActionState(upsertPlannedMealAction, null);
  const [updateState, updateFormAction] = useActionState(updatePlannedMealAction, null);
  const [deleteState, deleteFormAction] = useActionState(deletePlannedMealAction, null);

  const formState = mode === "edit" ? updateState : upsertState;
  const formAction = mode === "edit" ? updateFormAction : upsertFormAction;
  const success = formState?.ok === true;
  const error = formState && !formState.ok ? formState.error?.message : null;
  const fieldErrors = formState && !formState.ok ? formState.error?.fieldErrors ?? {} : {};

  if (deleteState?.ok) {
    onSuccess();
    onClose();
  }

  if (success && formState?.data?.id) {
    onSuccess();
    onClose();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="meal-modal-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-input border border-border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="meal-modal-title" className="text-lg font-semibold text-foreground">
          {mode === "add" ? "Add meal" : "Edit meal"}
        </h2>
        <form action={formAction} className="mt-4 space-y-4">
          {mode === "edit" && initialMeal && (
            <input type="hidden" name="id" value={initialMeal.id} />
          )}
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="mealSlot" value={mealSlot} />
          <input type="hidden" name="recipeId" value={useRecipe ? recipeId : ""} />
          <input type="hidden" name="customLabel" value={!useRecipe ? customLabel : ""} />
          <input type="hidden" name="servings" value={useRecipe ? servings : ""} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="meal-date">Day</Label>
              <select
                id="meal-date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 h-14 w-full rounded-input border border-input bg-background px-4 py-3 text-base"
              >
                {weekDates.map((d) => (
                  <option key={d} value={d}>
                    {new Date(d + "T12:00:00").toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="meal-slot">Meal</Label>
              <select
                id="meal-slot"
                value={mealSlot}
                onChange={(e) => setMealSlot(e.target.value)}
                className="mt-1 h-14 w-full rounded-input border border-input bg-background px-4 py-3 text-base"
              >
                {MEAL_SLOTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-4">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="type"
                checked={useRecipe}
                onChange={() => setUseRecipe(true)}
                className="rounded-full border-border"
              />
              <span className="text-sm">Recipe</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="type"
                checked={!useRecipe}
                onChange={() => setUseRecipe(false)}
                className="rounded-full border-border"
              />
              <span className="text-sm">Custom</span>
            </label>
          </div>

          {useRecipe ? (
            <>
              <div>
                <Label htmlFor="recipe-search">Recipe</Label>
                <input
                  id="recipe-search"
                  type="text"
                  placeholder="Search recipes…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="mt-1 h-14 w-full rounded-input border border-input bg-background px-4 py-3 text-base"
                />
                <ul className="mt-2 max-h-40 overflow-y-auto rounded-input border border-border">
                  {filteredRecipes.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setRecipeId(r.id)}
                        className={cn(
                          "w-full px-3 py-2 text-left text-sm hover:bg-muted",
                          recipeId === r.id && "bg-muted font-medium"
                        )}
                      >
                        {r.title}
                      </button>
                    </li>
                  ))}
                  {filteredRecipes.length === 0 && (
                    <li className="px-3 py-2 text-sm text-muted-foreground">
                      No recipes found.
                    </li>
                  )}
                </ul>
              </div>
              <div>
                <Label htmlFor="servings">Servings</Label>
                <Input
                  id="servings"
                  name="servings"
                  type="number"
                  min={1}
                  value={servings}
                  onChange={(e) => setServings(e.target.value)}
                  className="mt-1"
                />
                {fieldErrors.servings && (
                  <p className="mt-1 text-xs text-destructive">{fieldErrors.servings[0]}</p>
                )}
              </div>
            </>
          ) : (
            <div>
              <Label htmlFor="custom-label">Label</Label>
              <Input
                id="custom-label"
                name="customLabel"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="e.g. Leftovers, Takeout"
                className="mt-1"
              />
              <div className="mt-2 flex flex-wrap gap-1">
                {CUSTOM_PLACEHOLDERS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setCustomLabel(p)}
                    className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button type="submit">
                {mode === "add" ? "Add meal" : "Save"}
              </Button>
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
            </div>
            {mode === "edit" && initialMeal && (
              <form action={deleteFormAction}>
                <input type="hidden" name="id" value={initialMeal.id} />
                <Button type="submit" variant="destructive" size="sm">
                  Remove from plan
                </Button>
              </form>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
