"use client";

import { useCallback, useId, useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { IngredientCategoryOption } from "@/lib/ingredients/category-options";

function normalizeToCatalogName(
  raw: string | null | undefined,
  categories: IngredientCategoryOption[],
): string {
  const t = raw?.trim() ?? "";
  if (!t) return "";
  const exact = categories.find((c) => c.name === t);
  if (exact) return exact.name;
  const ci = categories.find((c) => c.name.toLowerCase() === t.toLowerCase());
  return ci?.name ?? "";
}

type Props = {
  id: string;
  name: string;
  categories: IngredientCategoryOption[];
  /** Current category name stored on the ingredient (must match a row name when set). */
  value: string;
  onValueChange: (name: string) => void;
  disabled?: boolean;
  error?: boolean;
};

/**
 * Searchable list of IngredientCategory names; writes the exact catalog `name` into the form.
 */
export function IngredientCategoryCombobox({
  id,
  name,
  categories,
  value,
  onValueChange,
  disabled,
  error,
}: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, query]);

  const displayLabel = value || "Select category…";

  const select = useCallback(
    (catName: string) => {
      onValueChange(catName);
      setOpen(false);
      setQuery("");
    },
    [onValueChange],
  );

  const onOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) setQuery("");
  }, []);

  return (
    <div className="space-y-1">
      <input type="hidden" name={name} value={value} />
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            id={id}
            disabled={disabled}
            aria-expanded={open}
            aria-controls={listId}
            aria-haspopup="listbox"
            className={cn(
              "h-10 w-full justify-between font-normal",
              !value && "text-muted-foreground",
              error && "border-destructive",
            )}
          >
            <span className="truncate">{displayLabel}</span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
          <Input
            placeholder="Search categories…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-2"
            autoFocus
            aria-label="Filter categories"
          />
          <div
            id={listId}
            role="listbox"
            className="max-h-60 overflow-y-auto rounded-md border border-border bg-background"
          >
            <button
              type="button"
              role="option"
              aria-selected={value === ""}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent"
              onClick={() => select("")}
            >
              <Check
                className={cn("size-4 shrink-0", value === "" ? "opacity-100" : "opacity-0")}
                aria-hidden
              />
              <span className="text-muted-foreground">None</span>
            </button>
            {filtered.length === 0 ? (
              <p className="px-2 py-2 text-sm text-muted-foreground">No matches.</p>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={value === c.name}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent"
                  onClick={() => select(c.name)}
                >
                  <Check
                    className={cn(
                      "size-4 shrink-0",
                      value === c.name ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden
                  />
                  <span className="truncate">{c.name}</span>
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export { normalizeToCatalogName };
