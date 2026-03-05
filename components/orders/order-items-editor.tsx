"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AppIcon, ICON_BUTTON_CLASS, ICON_LABEL_GAP_CLASS } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const addRow = () => {
    const first = recipeOptions[0];
    onChange([
      ...items,
      { recipeId: first?.id ?? "", batches: 1 },
    ]);
  };

  const removeRow = (index: number) => {
    if (items.length <= 1) return;
    onChange(items.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, patch: Partial<OrderItemRow>) => {
    const next = [...items];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

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
            <div key={index} className="flex flex-wrap items-center gap-2">
              <Select
                value={row.recipeId || "__none__"}
                onValueChange={(v) =>
                  updateRow(index, { recipeId: v === "__none__" ? "" : v })
                }
              >
                <SelectTrigger
                  className="block w-fit min-w-[180px] rounded-sm border border-input bg-background pl-3 pr-8 py-2 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  aria-label="Recipe"
                >
                  <SelectValue placeholder="Select recipe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select recipe</SelectItem>
                  {recipeOptions.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <label className="sr-only">Batches</label>
              <Input
                type="number"
                min={1}
                value={row.batches}
                onChange={(e) =>
                  updateRow(index, { batches: parseInt(e.target.value, 10) || 1 })
                }
                className="w-20"
                aria-label="Batches"
              />
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
