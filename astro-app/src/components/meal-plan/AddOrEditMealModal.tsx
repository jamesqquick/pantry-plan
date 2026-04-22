import { useState, useEffect, useCallback, useRef } from "react";
import { actions } from "astro:actions";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/Dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { fuzzyFilterRecipes, type RecipeOption } from "@/lib/search/fuzzy-recipe";
import type { PlannedMealItem } from "./meal-plan-types";

const MEAL_SLOTS = [
  { value: "BREAKFAST", label: "Breakfast" },
  { value: "LUNCH", label: "Lunch" },
  { value: "DINNER", label: "Dinner" },
] as const;

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
  const [searchQuery, setSearchQuery] = useState("");
  const [date, setDate] = useState(initialDate);
  const [mealSlot, setMealSlot] = useState(initialMealSlot);
  const [pending, setPending] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedRecipeTitle = recipeId
    ? (recipeOptions.find((r) => r.id === recipeId)?.title ?? "")
    : "";

  // Reset state when modal opens.
  useEffect(() => {
    if (!open) return;
    const id = initialMeal?.recipeId ?? initialRecipeIdForAdd ?? "";
    setRecipeId(id);
    setSearchQuery(
      id ? (recipeOptions.find((r) => r.id === id)?.title ?? "") : "",
    );
    setDate(initialDate);
    setMealSlot(initialMealSlot);
    setError(null);
  }, [open, initialDate, initialMealSlot, initialMeal, initialRecipeIdForAdd, recipeOptions]);

  // Close dropdown when clicking outside.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredRecipes = searchQuery.trim()
    ? fuzzyFilterRecipes(recipeOptions, searchQuery.trim()).slice(0, 15)
    : recipeOptions.slice(0, 15);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchQuery(value);
      setShowDropdown(true);
      if (selectedRecipeTitle && value !== selectedRecipeTitle) {
        setRecipeId("");
      }
    },
    [selectedRecipeTitle],
  );

  const handleSelectRecipe = useCallback((r: RecipeOption) => {
    setRecipeId(r.id);
    setSearchQuery(r.title);
    setShowDropdown(false);
  }, []);

  const anyPending = pending || deletePending;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!recipeId.trim()) return;
      setPending(true);
      setError(null);

      try {
        if (mode === "edit" && initialMeal) {
          const { error: err } = await actions.mealPlan.update({
            id: initialMeal.id,
            date,
            mealSlot: mealSlot as "BREAKFAST" | "LUNCH" | "DINNER",
            recipeId,
            customLabel: null,
            servings: undefined,
          });
          if (err) throw new Error(err.message);
        } else {
          const { error: err } = await actions.mealPlan.upsert({
            date,
            mealSlot: mealSlot as "BREAKFAST" | "LUNCH" | "DINNER",
            recipeId,
            customLabel: undefined,
            servings: undefined,
          });
          if (err) throw new Error(err.message);
        }
        onSuccess();
        onClose();
      } catch (err: any) {
        setError(err.message ?? "Something went wrong.");
      } finally {
        setPending(false);
      }
    },
    [recipeId, mode, initialMeal, date, mealSlot, onSuccess, onClose],
  );

  const handleDelete = useCallback(async () => {
    if (!initialMeal) return;
    setDeletePending(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.set("id", initialMeal.id);
      const { error: err } = await actions.mealPlan.delete(formData);
      if (err) throw new Error(err.message);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message ?? "Something went wrong.");
    } finally {
      setDeletePending(false);
    }
  }, [initialMeal, onSuccess, onClose]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !anyPending) onClose();
      }}
    >
      <DialogContent
        className="max-w-md"
        aria-describedby={undefined}
        onPointerDownOutside={(e) => {
          if (anyPending) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (anyPending) e.preventDefault();
        }}
      >
        <DialogTitle>{mode === "add" ? "Add meal" : "Edit meal"}</DialogTitle>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Day + Meal Slot pickers */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="meal-date"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Day
              </label>
              <Select value={date} onValueChange={setDate}>
                <SelectTrigger id="meal-date" className="min-w-0">
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
              <label
                htmlFor="meal-slot"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Meal
              </label>
              <Select value={mealSlot} onValueChange={setMealSlot}>
                <SelectTrigger id="meal-slot" className="min-w-0">
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

          {/* Recipe search picker */}
          <div ref={dropdownRef} className="relative">
            <label
              htmlFor="recipe-search"
              className="mb-2 block text-sm font-medium text-foreground"
            >
              Recipe
            </label>
            <Input
              ref={inputRef}
              id="recipe-search"
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => setShowDropdown(true)}
              placeholder="Search recipes..."
              autoComplete="off"
            />
            {showDropdown && filteredRecipes.length > 0 && (
              <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                {filteredRecipes.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectRecipe(r)}
                      className={`w-full cursor-pointer px-3 py-2 text-left text-sm transition-colors hover:bg-primary/10 ${
                        r.id === recipeId
                          ? "bg-primary/10 font-medium text-primary-on-card"
                          : "text-card-foreground"
                      }`}
                    >
                      {r.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {showDropdown && searchQuery.trim() && filteredRecipes.length === 0 && (
              <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground shadow-lg">
                No recipes found
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-2">
              <button
                type="submit"
                disabled={!recipeId.trim() || pending}
                aria-busy={pending}
                className="btn-primary"
              >
                {pending
                  ? mode === "add"
                    ? "Adding\u2026"
                    : "Saving\u2026"
                  : mode === "add"
                    ? "Add meal"
                    : "Save"}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={anyPending}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
            {mode === "edit" && initialMeal && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={anyPending}
                aria-busy={deletePending}
                className="inline-flex w-full cursor-pointer items-center justify-center rounded-input border border-destructive bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground transition-colors hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed sm:w-auto"
              >
                {deletePending ? "Deleting\u2026" : "Delete"}
              </button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
