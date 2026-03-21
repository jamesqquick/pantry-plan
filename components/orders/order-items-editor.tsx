"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { AppIcon, ICON_BUTTON_CLASS, ICON_LABEL_GAP_CLASS } from "@/components/ui/icons";
import { SearchablePicker } from "@/components/ui/searchable-picker";
import { fuzzyFilterRecipes } from "@/lib/search/fuzzy-recipe";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ORDER_ITEM_BATCH_VALUES } from "@/features/orders/orders.schemas";

function orderBatchSelectLabel(value: number): string {
  return value === 0.5 ? "1/2" : String(value);
}

export type RecipeOption = { id: string; title: string };

export type OrderItemRow = { recipeId: string; batches: number };

type Props = {
  recipeOptions: RecipeOption[];
  items: OrderItemRow[];
  onChange: (items: OrderItemRow[]) => void;
  fieldErrors?: Record<string, string[]>;
};

export function OrderItemsEditor({
  recipeOptions,
  items,
  onChange,
  fieldErrors,
}: Props) {
  const [searchQueries, setSearchQueries] = useState<(string | undefined)[]>([]);

  const addRow = () => {
    onChange([...items, { recipeId: "", batches: 1 }]);
  };

  const removeRow = (index: number) => {
    if (items.length <= 1) return;
    onChange(items.filter((_, i) => i !== index));
    setSearchQueries((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, patch: Partial<OrderItemRow>) => {
    const next = [...items];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const getDisplayValue = useCallback(
    (index: number) => {
      const row = items[index];
      const query = searchQueries[index];
      if (query !== undefined) return query;
      if (row?.recipeId) {
        return recipeOptions.find((r) => r.id === row.recipeId)?.title ?? "";
      }
      return "";
    },
    [items, recipeOptions, searchQueries]
  );

  const setDisplayValue = useCallback((index: number, value: string | undefined) => {
    setSearchQueries((prev) => {
      const next = [...prev];
      while (next.length <= index) next.push(undefined);
      next[index] = value;
      return next;
    });
  }, []);

  /** Recipe IDs already used in other rows (so we don't show them in this row's picker). */
  const getUsedRecipeIdsForRow = useCallback(
    (currentIndex: number) => {
      const used = new Set<string>();
      items.forEach((row, i) => {
        if (i !== currentIndex && row.recipeId) used.add(row.recipeId);
      });
      return used;
    },
    [items]
  );

  const itemsError = fieldErrors?.items?.[0];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">
          Recipes & batches
        </label>
        <Button type="button" variant="ghost" onClick={addRow} className={ICON_LABEL_GAP_CLASS}>
          <AppIcon name="add" size={16} aria-hidden />
          Add recipe
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No items. Add at least one recipe.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((row, index) => (
            <div
              key={index}
              className="flex w-full min-w-0 items-center gap-2"
            >
              <div className="min-w-0 flex-1">
                <SearchablePicker<RecipeOption>
                  options={[]}
                  getItemId={(r) => r.id}
                  getItemLabel={(r) => r.title}
                  onSelect={(r) => {
                    const used = getUsedRecipeIdsForRow(index);
                    if (used.has(r.id)) return;
                    const next = [...items];
                    next[index] = { ...next[index], recipeId: r.id };
                    onChange([...next, { recipeId: "", batches: 1 }]);
                  }}
                  onSearch={(query) => {
                    const used = getUsedRecipeIdsForRow(index);
                    const available = recipeOptions.filter(
                      (opt) => !used.has(opt.id)
                    );
                    return Promise.resolve(
                      fuzzyFilterRecipes(available, query)
                    );
                  }}
                  displayValue={getDisplayValue(index)}
                  onDisplayValueChange={(v) => setDisplayValue(index, v)}
                  placeholder="Search recipes"
                  emptyMessage="Type to search or pick a recipe"
                  noResultsMessage="No recipes found"
                  containerClassName="w-full min-w-0"
                />
              </div>
              <div className="flex shrink-0 items-center gap-2">
              <label className="sr-only">Batches</label>
              <Select
                value={String(row.batches)}
                onValueChange={(v) => updateRow(index, { batches: Number(v) })}
              >
                <SelectTrigger
                  aria-label="Batches"
                  size="sm"
                  className="min-w-[7rem] shrink-0"
                >
                  <SelectValue
                    placeholder="Batches"
                    className="!block !min-w-[2.5ch] !shrink-0 !grow-0 !overflow-visible !text-clip"
                  />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_ITEM_BATCH_VALUES.map((v) => (
                    <SelectItem key={v} value={String(v)}>
                      {orderBatchSelectLabel(v)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-sm text-muted-foreground">batches</span>
              <Button
                type="button"
                variant="ghost"
                className={ICON_BUTTON_CLASS}
                onClick={() => removeRow(index)}
                aria-label="Remove recipe from order"
                disabled={items.length === 1}
              >
                <AppIcon name="delete" size={18} aria-hidden />
              </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {itemsError && (
        <p className="text-sm text-destructive" role="alert">
          {itemsError}
        </p>
      )}
    </div>
  );
}
