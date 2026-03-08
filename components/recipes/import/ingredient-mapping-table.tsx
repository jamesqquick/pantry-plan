"use client";

import React from "react";
import { IngredientEditorRow } from "@/components/recipes/ingredient-editor-row";
import { Button } from "@/components/ui/button";
import { AppIcon, ICON_BUTTON_CLASS } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import type { SuggestionItem } from "@/lib/ingredients/compute-suggestions";
import type { IngredientUnit } from "@/generated/prisma/client";

export type MappingRow = {
  id: string;
  initialRawText: string;
  rawText: string;
  displayText: string;
  normalizedKey: string;
  ingredientId: string;
  ingredientName: string;
  createName: string;
  quantityText: string;
  unit: IngredientUnit | null;
  sortOrder: number;
  didInitQtyUnit: boolean;
  matchType?: "exact" | "alias" | "fuzzy" | "llm";
};

type CatalogItem = { id: string; name: string };

export function IngredientMappingTable({
  suggestions,
  catalog,
  onSearchIngredients,
  rows,
  setRows,
  fieldErrors,
  firstNeedsAttentionIndex,
  firstNeedsAttentionRef,
}: {
  suggestions: SuggestionItem[];
  catalog: CatalogItem[];
  onSearchIngredients?: (query: string) => Promise<CatalogItem[]>;
  rows: MappingRow[];
  setRows: React.Dispatch<React.SetStateAction<MappingRow[]>>;
  fieldErrors?: Record<string, string[]>;
  firstNeedsAttentionIndex?: number;
  firstNeedsAttentionRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const updateRow = (index: number, patch: Partial<MappingRow>) => {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, ...patch } : r))
    );
  };

  return (
    <div className="space-y-4">
      <div className="space-y-5">
        {rows.map((row, i) => {
          const isFirstNeedsAttention =
            firstNeedsAttentionIndex === i && firstNeedsAttentionRef;
          const needsQuantityOutline = !row.quantityText?.trim();
          const needsUnitOutline = !row.unit;
          const needsPickerOutline = !row.ingredientId && !row.createName?.trim();
          return (
            <div
              key={row.id}
              ref={isFirstNeedsAttention ? firstNeedsAttentionRef : undefined}
            >
              {row.rawText.trim() && (
                <div
                  className="flex items-center justify-between gap-2"
                  aria-label="Original ingredient line"
                >
                <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                  <span className="not-italic">Original:</span>{" "}
                  <span className="italic">{row.rawText}</span>
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  className={cn(ICON_BUTTON_CLASS, "h-9 shrink-0")}
                  onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                  disabled={rows.length <= 1}
                  aria-label="Remove row"
                >
                  <AppIcon name="delete" size={18} aria-hidden />
                </Button>
                </div>
              )}
              {!row.rawText.trim() && (
                <div className="mb-3 flex justify-end">
                  <Button
                  type="button"
                  variant="ghost"
                  className={cn(ICON_BUTTON_CLASS, "h-9 shrink-0")}
                  onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                  disabled={rows.length <= 1}
                  aria-label="Remove row"
                >
                  <AppIcon name="delete" size={18} aria-hidden />
                  </Button>
                </div>
              )}
              <IngredientEditorRow
                mode="mapping"
                hideLabels
                outlineQuantity={needsQuantityOutline}
                outlineUnit={needsUnitOutline}
                outlinePicker={needsPickerOutline}
                displayText={row.displayText}
                onDisplayTextChange={(v) => updateRow(i, { displayText: v })}
                quantityText={row.quantityText}
                onQuantityTextChange={(v) => updateRow(i, { quantityText: v })}
                unit={row.unit}
                onUnitChange={(v) => updateRow(i, { unit: v })}
                catalog={catalog}
                onSearchIngredients={onSearchIngredients}
                ingredientId={row.ingredientId}
                onChangeIngredient={(id, name) =>
                  updateRow(i, {
                    ingredientId: id,
                    ingredientName: name,
                    createName: "",
                  })
                }
                selectedIngredientName={row.ingredientName}
                displayLabel={row.createName.trim() ? `New: ${row.createName}` : undefined}
                onCreateNew={(name) =>
                  updateRow(i, {
                    createName: name,
                    ingredientId: "",
                    ingredientName: "",
                  })
                }
                pickerError={fieldErrors?.[`ingredientLines.${i}.createName`]?.[0]}
                rowId={row.id}
                compact
                canRemove={rows.length > 1}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
