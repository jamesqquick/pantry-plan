"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppIcon, ICON_BUTTON_CLASS } from "@/components/ui/icons";
import { SortableListProvider, SortableRow } from "@/components/ui/sortable-list";
import { cn } from "@/lib/cn";

const TOUCH_TARGET = "min-h-[44px] min-w-[44px]";
const BADGE_CLASS =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground";

export type SortableInstructionsListProps = {
  items: string[];
  onItemsChange: (items: string[]) => void;
  placeholder?: string;
  removeLabel: string;
  addLabel?: string;
  minItems?: number;
  /** When set, render form inputs with name and defaultValue for FormData submit order */
  formInputName?: string;
  formInputError?: boolean;
  onAdd?: () => void;
};

export function SortableInstructionsList({
  items,
  onItemsChange,
  placeholder = "Step description",
  removeLabel = "Remove step",
  addLabel = "Add step",
  minItems = 1,
  formInputName,
  formInputError,
  onAdd,
}: SortableInstructionsListProps) {
  const list = items.length === 0 ? [""] : items;
  const canRemove = list.length > minItems;

  const updateAt = (index: number, value: string) => {
    const next = [...(items.length === 0 ? [""] : items)];
    next[index] = value;
    onItemsChange(next);
  };

  const removeAt = (index: number) => {
    const next = (items.length === 0 ? [""] : items).filter((_, i) => i !== index);
    onItemsChange(next.length === 0 ? [""] : next);
  };

  return (
    <SortableListProvider items={list} onReorder={(next) => onItemsChange(next.length === 0 ? [""] : next)}>
      <ol className="mt-2 list-none space-y-4 p-0" role="list">
        {list.map((item, i) => (
          <li key={i}>
            <SortableRow
              id={i}
              dragHandleAriaLabel={`${removeLabel.replace("Remove ", "Reorder ")} ${i + 1}`}
              className="flex-nowrap"
            >
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap min-w-0 w-full">
                <span className={cn(BADGE_CLASS)} aria-hidden>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1 flex gap-2 flex-wrap sm:flex-nowrap">
                  {formInputName ? (
                    <>
                      <input type="hidden" name={formInputName} value={item} readOnly />
                      <Input
                        value={item}
                        onChange={(e) => updateAt(i, e.target.value)}
                        placeholder={placeholder}
                        error={!!formInputError}
                        className="flex-1 min-w-0"
                      />
                    </>
                  ) : (
                    <Input
                      value={item}
                      onChange={(e) => updateAt(i, e.target.value)}
                      placeholder={placeholder}
                      className="flex-1 min-w-0"
                    />
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    className={cn(ICON_BUTTON_CLASS, TOUCH_TARGET)}
                    onClick={() => removeAt(i)}
                    aria-label={removeLabel}
                    disabled={!canRemove}
                  >
                    <AppIcon name="delete" size={18} aria-hidden />
                  </Button>
                </div>
              </div>
            </SortableRow>
          </li>
        ))}
      </ol>
      {onAdd && (
        <Button
          type="button"
          variant="secondary"
          aria-label={addLabel}
          onClick={onAdd}
          className={cn("mt-4", ICON_BUTTON_CLASS, TOUCH_TARGET)}
        >
          <AppIcon name="add" size={18} aria-hidden />
        </Button>
      )}
    </SortableListProvider>
  );
}
