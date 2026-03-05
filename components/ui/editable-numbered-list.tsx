"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AppIcon, ICON_BUTTON_CLASS } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

type EditableNumberedListProps = {
  items: string[];
  onItemsChange: (items: string[]) => void;
  placeholder?: string;
  removeLabel: string;
  minItems?: number;
  /** Optional: class for the number badge to match context (e.g. h-8 w-8 text-sm) */
  badgeClassName?: string;
};

export function EditableNumberedList({
  items,
  onItemsChange,
  placeholder = "Item",
  removeLabel,
  minItems = 1,
  badgeClassName = "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground",
}: EditableNumberedListProps) {
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
    <ol className="mt-2 list-none space-y-4 p-0" role="list">
      {list.map((item, i) => (
        <li key={i} className="flex items-center gap-3">
          <span className={cn(badgeClassName)} aria-hidden>
            {i + 1}
          </span>
          <div className="min-w-0 flex-1 flex gap-2">
            <Input
              value={item}
              onChange={(e) => updateAt(i, e.target.value)}
              placeholder={placeholder}
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              className={ICON_BUTTON_CLASS}
              onClick={() => removeAt(i)}
              aria-label={removeLabel}
              disabled={!canRemove}
            >
              <AppIcon name="delete" size={18} aria-hidden />
            </Button>
          </div>
        </li>
      ))}
    </ol>
  );
}
