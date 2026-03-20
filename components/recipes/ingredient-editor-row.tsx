"use client";

import { useCallback } from "react";
import { Input } from "@/components/ui/input";
import { SmartQuantityInput } from "@/components/forms/smart-quantity-input";
import { Button } from "@/components/ui/button";
import { ImportIngredientPicker } from "@/components/recipes/import/import-ingredient-picker";
import { INGREDIENT_UNITS, UNIT_LABELS } from "@/lib/ingredients/units";
import type { IngredientUnit } from "@/generated/prisma/client";
import { AppIcon, ICON_BUTTON_CLASS } from "@/components/ui/icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/cn";

export type IngredientEditorRowCatalogItem = { id: string; name: string; source?: "global" | "custom" };

export type IngredientEditorRowMode = "mapping" | "edit";

export type IngredientEditorRowProps = {
  mode?: IngredientEditorRowMode;
  /** Editable ingredient line without quantity/unit (shown on recipe). */
  displayText: string;
  onDisplayTextChange: (value: string) => void;
  /** Placeholder for the display text input. */
  displayTextPlaceholder?: string;
  /** Quantity as editable text (e.g. "1 1/2", "3/4"). */
  quantityText: string;
  onQuantityTextChange: (value: string) => void;
  onQuantityCommit?: (v: {
    value: number | null;
    text: string;
    isValid: boolean;
  }) => void;
  unit: IngredientUnit | null;
  onUnitChange: (value: IngredientUnit | null) => void;
  catalog: IngredientEditorRowCatalogItem[];
  onSearchIngredients?: (query: string) => Promise<IngredientEditorRowCatalogItem[]>;
  ingredientId: string;
  onChangeIngredient: (id: string, name: string) => void;
  selectedIngredientName?: string;
  placeholder?: string;
  displayLabel?: string;
  onCreateNew?: (name: string) => void;
  onSelectNew?: (name: string) => Promise<{ id: string; name: string } | null>;
  onRemove?: () => void;
  canRemove?: boolean;
  pickerError?: string | null;
  rowId?: string;
  compact?: boolean;
  /** When true, show a thin top border to separate from the previous row (non-compact only). */
  separatorAbove?: boolean;
  /** When 'tableRow', render as a <tr> with <td> cells (no per-cell labels); for use inside a table with shared thead. */
  variant?: "default" | "tableRow";
  /** When true, do not render labels above inputs (e.g. in mapping workflow). */
  hideLabels?: boolean;
  /** When true, show yellow outline on quantity input (e.g. unmapped/partial row). */
  outlineQuantity?: boolean;
  /** When true, show yellow outline on unit select. */
  outlineUnit?: boolean;
  /** When true, show yellow outline on ingredient picker. */
  outlinePicker?: boolean;
};

export function IngredientEditorRow({
  mode,
  displayText,
  onDisplayTextChange,
  displayTextPlaceholder = "e.g. all-purpose flour",
  quantityText,
  onQuantityTextChange,
  onQuantityCommit,
  unit,
  onUnitChange,
  catalog,
  onSearchIngredients,
  ingredientId,
  onChangeIngredient,
  selectedIngredientName,
  placeholder = "Search or choose",
  displayLabel,
  onCreateNew,
  onSelectNew,
  onRemove,
  canRemove = true,
  pickerError,
  rowId,
  compact = false,
  separatorAbove = false,
  variant = "default",
  hideLabels = false,
  outlineQuantity = false,
  outlineUnit = false,
  outlinePicker = false,
}: IngredientEditorRowProps) {
  void mode;
  const inputClass = compact ? "w-full text-sm" : "w-full";
  const borderWarningClass = "border-amber-400";

  const stopProp = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const tdClass = "border border-border px-3 py-2 align-top";

  if (variant === "tableRow") {
    return (
      <tr data-row-id={rowId} className="block sm:table-row">
        <td className={cn(tdClass, "block w-full sm:table-cell sm:w-22 sm:min-w-0")}>
          <SmartQuantityInput
            valueText={quantityText}
            onChangeText={onQuantityTextChange}
            onCommit={onQuantityCommit}
            ariaLabel="Quantity"
          />
        </td>
        <td className={cn(tdClass, "block w-full sm:table-cell sm:w-32 sm:min-w-0")}>
          <Select
            value={unit ?? "__none__"}
            onValueChange={(v) =>
              onUnitChange((v === "__none__" ? null : v) as IngredientUnit | null)
            }
          >
            <SelectTrigger className="min-w-28 w-full" aria-label="Unit">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent className="min-w-32">
              <SelectItem value="__none__">—</SelectItem>
              {INGREDIENT_UNITS.map((u) => (
                <SelectItem key={u} value={u}>
                  {UNIT_LABELS[u]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </td>
        <td className={cn(tdClass, "block w-full sm:table-cell min-w-0")}>
          <Input
            type="text"
            placeholder={displayTextPlaceholder}
            className={inputClass}
            value={displayText}
            onChange={(e) => onDisplayTextChange(e.target.value)}
            aria-label="Display text"
          />
        </td>
        <td className={cn(tdClass, "block w-full sm:table-cell min-w-0")}>
          <ImportIngredientPicker
            catalog={catalog}
            value={ingredientId}
            displayLabel={displayLabel}
            placeholder={placeholder}
            onChange={onChangeIngredient}
            onSearch={onSearchIngredients}
            selectedIngredientName={selectedIngredientName}
            onCreateNew={onCreateNew}
            onSelectNew={onSelectNew}
          />
          {pickerError && (
            <p
              className="mt-1 text-sm text-destructive"
              role="alert"
            >
              {pickerError}
            </p>
          )}
        </td>
        {onRemove && (
          <td className={cn(tdClass, "block w-full sm:table-cell sm:w-12")}>
            <Button
              type="button"
              variant="ghost"
              className={cn(ICON_BUTTON_CLASS, "h-9 shrink-0")}
              onClick={(e) => {
                stopProp(e);
                onRemove();
              }}
              disabled={!canRemove}
              aria-label="Remove row"
            >
              <AppIcon name="delete" size={18} aria-hidden />
            </Button>
          </td>
        )}
      </tr>
    );
  }

  return (
    <div
      className={cn(
        compact ? "space-y-2" : "space-y-2 pb-2",
        !compact && separatorAbove && "border-t border-border pt-2",
      )}
      data-row-id={rowId}
    >
      <div
        className={cn(
          "grid grid-cols-1 gap-y-2 gap-x-3",
          onRemove
            ? "md:grid-cols-[1fr_minmax(0,12rem)_auto]"
            : "md:grid-cols-[1fr_minmax(0,12rem)]",
          !compact && onRemove && "md:grid-cols-[1fr_minmax(0,12rem)_auto]",
          !compact && !onRemove && "md:grid-cols-[1fr_minmax(0,12rem)]",
        )}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-nowrap sm:items-end sm:gap-2">
          <div className="min-w-0 w-full shrink-0 sm:basis-20 md:max-w-22">
            {!hideLabels && (
              <label className="mb-0.5 block text-xs font-medium text-foreground">
                Qty
              </label>
            )}
            <SmartQuantityInput
              valueText={quantityText}
              onChangeText={onQuantityTextChange}
              onCommit={onQuantityCommit}
              ariaLabel="Quantity"
              className={outlineQuantity ? borderWarningClass : undefined}
            />
          </div>
          <div className="min-w-0 w-full shrink-0 sm:min-w-28 sm:basis-28">
            {!hideLabels && (
              <label className="mb-0.5 block text-xs font-medium text-foreground">
                Unit
              </label>
            )}
            <Select
              value={unit ?? "__none__"}
              onValueChange={(v) =>
                onUnitChange((v === "__none__" ? null : v) as IngredientUnit | null)
              }
            >
              <SelectTrigger
                className={cn("min-w-28 w-full", outlineUnit && borderWarningClass)}
                aria-label="Unit"
              >
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent className="min-w-32">
                <SelectItem value="__none__">—</SelectItem>
                {INGREDIENT_UNITS.map((u) => (
                  <SelectItem key={u} value={u}>
                    {UNIT_LABELS[u]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-0 w-full flex-1">
            {!hideLabels && (
              <label className="mb-0.5 block text-xs font-medium text-foreground">
                Display text
              </label>
            )}
            <Input
              type="text"
              placeholder={displayTextPlaceholder}
              className={inputClass}
              value={displayText}
              onChange={(e) => onDisplayTextChange(e.target.value)}
              aria-label="Display text"
            />
          </div>
        </div>
        <div className="min-w-0">
          {!hideLabels && (
            <label className="mb-0.5 block text-xs font-medium text-foreground">
              Base ingredient
            </label>
          )}
          <ImportIngredientPicker
            catalog={catalog}
            value={ingredientId}
            displayLabel={displayLabel}
            placeholder={placeholder}
            onChange={onChangeIngredient}
            onSearch={onSearchIngredients}
            selectedIngredientName={selectedIngredientName}
            onCreateNew={onCreateNew}
            onSelectNew={onSelectNew}
            inputClassName={outlinePicker ? borderWarningClass : undefined}
          />
          {pickerError && (
            <p
              className="mt-1 text-sm text-destructive"
              role="alert"
            >
              {pickerError}
            </p>
          )}
        </div>
        {onRemove && (
          <div className="min-w-0 flex flex-col">
            {!hideLabels && (
              <span className="mb-0.5 block text-xs font-medium text-transparent select-none" aria-hidden>
                —
              </span>
            )}
            <Button
              type="button"
              variant="ghost"
              className={cn(ICON_BUTTON_CLASS, "h-9 shrink-0 self-start")}
              onClick={(e) => {
                stopProp(e);
                onRemove();
              }}
              disabled={!canRemove}
              aria-label="Remove row"
            >
              <AppIcon name="delete" size={18} aria-hidden />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
