"use client";

import { useState, useEffect, useCallback } from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AppIcon } from "@/components/ui/icons";
import { SearchablePicker } from "@/components/ui/searchable-picker";
import { fuzzyFilterRecipes } from "@/lib/search/fuzzy-recipe";
import {
  upsertPlannedMealAction,
  updatePlannedMealAction,
  deletePlannedMealAction,
} from "@/app/actions/meal-plan.actions";
import type { PlannedMealItem } from "./planned-meal-slot";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

const MEAL_SLOTS = [
  { value: "BREAKFAST", label: "Breakfast" },
  { value: "LUNCH", label: "Lunch" },
  { value: "DINNER", label: "Dinner" },
] as const;

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
  const [recipeId, setRecipeId] = useState(
    initialMeal?.recipeId ?? initialRecipeIdForAdd ?? "",
  );
  const [recipeSearchDisplay, setRecipeSearchDisplay] = useState("");
  const [date, setDate] = useState(initialDate);
  const [mealSlot, setMealSlot] = useState(initialMealSlot);

  const selectedRecipeTitle = recipeId
    ? (recipeOptions.find((r) => r.id === recipeId)?.title ?? undefined)
    : undefined;

  useEffect(() => {
    if (!open) return;
    const initialId =
      initialMeal?.recipeId ?? initialRecipeIdForAdd ?? "";
    setRecipeId(initialId);
    setRecipeSearchDisplay(
      initialId ? recipeOptions.find((r) => r.id === initialId)?.title ?? "" : ""
    );
    setDate(initialDate);
    setMealSlot(initialMealSlot);
  }, [
    open,
    initialDate,
    initialMealSlot,
    initialMeal,
    initialRecipeIdForAdd,
    recipeOptions,
  ]);

  const handleRecipeSearch = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (trimmed === "") return Promise.resolve([] as RecipeOption[]);
      return Promise.resolve(fuzzyFilterRecipes(recipeOptions, trimmed));
    },
    [recipeOptions]
  );

  const handleRecipeSelect = useCallback((r: RecipeOption) => {
    setRecipeId(r.id);
    setRecipeSearchDisplay(r.title);
  }, []);

  const handleRecipeDisplayChange = useCallback(
    (value: string) => {
      setRecipeSearchDisplay(value);
      if (selectedRecipeTitle !== undefined && value !== selectedRecipeTitle) {
        setRecipeId("");
      }
    },
    [selectedRecipeTitle]
  );

  const [upsertState, upsertFormAction, upsertPending] = useActionState(
    upsertPlannedMealAction,
    null,
  );
  const [updateState, updateFormAction, updatePending] = useActionState(
    updatePlannedMealAction,
    null,
  );
  const [deleteState, deleteFormAction, deletePending] = useActionState(
    deletePlannedMealAction,
    null,
  );

  const formState = mode === "edit" ? updateState : upsertState;
  const formPending = mode === "edit" ? updatePending : upsertPending;
  const anyPending = formPending || deletePending;
  const formAction = mode === "edit" ? updateFormAction : upsertFormAction;
  const success = formState?.ok === true;
  const error = formState && !formState.ok ? formState.error?.message : null;
  const fieldErrors =
    formState && !formState.ok ? (formState.error?.fieldErrors ?? {}) : {};

  const shouldCloseOnSuccess =
    deleteState?.ok || (success && !!formState?.data?.id);

  useEffect(() => {
    if (!shouldCloseOnSuccess) return;
    onSuccess();
    onClose();
  }, [shouldCloseOnSuccess, onSuccess, onClose]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent
        className="max-w-md"
        aria-labelledby="meal-modal-title"
        onPointerDownOutside={(e) => {
          if (anyPending) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (anyPending) e.preventDefault();
        }}
      >
        <DialogTitle id="meal-modal-title">
          {mode === "add" ? "Add meal" : "Edit meal"}
        </DialogTitle>
        <form action={formAction} className="mt-4 space-y-4">
          {mode === "edit" && initialMeal && (
            <input type="hidden" name="id" value={initialMeal.id} />
          )}
          <input type="hidden" name="date" value={date} />
          <input type="hidden" name="mealSlot" value={mealSlot} />
          <input type="hidden" name="recipeId" value={recipeId} />
          <input type="hidden" name="customLabel" value="" />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="meal-date">Day</Label>
              <Select value={date} onValueChange={setDate}>
                <SelectTrigger id="meal-date" className="mt-2 w-full">
                  <SelectValue placeholder="Day" />
                </SelectTrigger>
                <SelectContent>
                  {weekDates.map((d) => (
                    <SelectItem key={d} value={d}>
                      {new Date(d + "T12:00:00").toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="meal-slot">Meal</Label>
              <Select value={mealSlot} onValueChange={setMealSlot}>
                <SelectTrigger id="meal-slot" className="mt-2 w-full">
                  <SelectValue placeholder="Meal" />
                </SelectTrigger>
                <SelectContent>
                  {MEAL_SLOTS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <SearchablePicker<RecipeOption>
              options={[]}
              getItemId={(r) => r.id}
              getItemLabel={(r) => r.title}
              onSelect={handleRecipeSelect}
              onSearch={handleRecipeSearch}
              displayValue={recipeSearchDisplay}
              onDisplayValueChange={handleRecipeDisplayChange}
              label="Recipe"
              placeholder="Search recipes"
              emptyMessage="Type to search"
              noResultsMessage="No recipes found"
              containerClassName="w-full"
              trailingIcon={
                <AppIcon
                  name="search"
                  size={16}
                  aria-hidden
                  className="opacity-60"
                />
              }
            />
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-2">
              <Button
                type="submit"
                disabled={!recipeId.trim() || formPending}
                aria-busy={formPending}
              >
                {formPending
                  ? mode === "add"
                    ? "Adding…"
                    : "Saving…"
                  : mode === "add"
                    ? "Add meal"
                    : "Save"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={anyPending}
              >
                Cancel
              </Button>
            </div>
            {mode === "edit" && initialMeal && (
              <Button
                type="submit"
                formAction={deleteFormAction}
                variant="destructive"
                className="w-full sm:w-auto"
                disabled={anyPending}
                aria-busy={deletePending}
              >
                {deletePending ? "Deleting…" : "Delete"}
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
