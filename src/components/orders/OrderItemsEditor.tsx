import { useState, useCallback } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { ORDER_ITEM_BATCH_VALUES } from "@/features/orders/orders.schemas";

function batchLabel(v: number): string {
  return v === 0.5 ? "½" : String(v);
}

export type RecipeOption = { id: string; title: string };
export type OrderItemRow = { recipeId: string; batches: number };

interface OrderItemsEditorProps {
  recipeOptions: RecipeOption[];
  items: OrderItemRow[];
  onChange: (items: OrderItemRow[]) => void;
}

export function OrderItemsEditor({
  recipeOptions,
  items,
  onChange,
}: OrderItemsEditorProps) {
  const [searchQueries, setSearchQueries] = useState<Record<number, string>>({});

  function addRow() {
    onChange([...items, { recipeId: "", batches: 1 }]);
  }

  function removeRow(index: number) {
    if (items.length <= 1) return;
    onChange(items.filter((_, i) => i !== index));
  }

  function updateRow(index: number, patch: Partial<OrderItemRow>) {
    const next = [...items];
    next[index] = { ...next[index]!, ...patch };
    onChange(next);
  }

  // IDs already used in other rows.
  const getUsedIds = useCallback(
    (currentIndex: number) => {
      const used = new Set<string>();
      items.forEach((row, i) => {
        if (i !== currentIndex && row.recipeId) used.add(row.recipeId);
      });
      return used;
    },
    [items],
  );

  // Filter recipes based on search + exclude already-used.
  const getFilteredOptions = useCallback(
    (index: number) => {
      const used = getUsedIds(index);
      const q = (searchQueries[index] ?? "").toLowerCase();
      return recipeOptions.filter(
        (r) => !used.has(r.id) && (!q || r.title.toLowerCase().includes(q)),
      );
    },
    [recipeOptions, getUsedIds, searchQueries],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">
          Recipes & batches
        </label>
        <Button type="button" variant="secondary" size="sm" onClick={addRow} className="min-h-11">
          {/* Lucide Plus */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="mr-1 h-3.5 w-3.5"
            aria-hidden="true"
          >
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          Add recipe
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No items. Add at least one recipe.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((row, index) => {
            const selectedRecipe = recipeOptions.find((r) => r.id === row.recipeId);
            return (
              <div
                key={index}
                className="flex flex-col gap-2 sm:flex-row sm:items-center"
              >
                {/* Recipe picker */}
                <div className="relative min-w-0 flex-1">
                  <RecipePickerInput
                    value={row.recipeId}
                    displayName={selectedRecipe?.title ?? ""}
                    options={getFilteredOptions(index)}
                    searchQuery={searchQueries[index] ?? ""}
                    onSearchChange={(q) =>
                      setSearchQueries((prev) => ({ ...prev, [index]: q }))
                    }
                    onSelect={(id) => {
                      updateRow(index, { recipeId: id });
                      setSearchQueries((prev) => ({ ...prev, [index]: "" }));
                    }}
                  />
                </div>

                {/* Batches + remove */}
                <div className="flex items-center gap-2">
                  <Select
                    value={String(row.batches)}
                    onValueChange={(v) => updateRow(index, { batches: Number(v) })}
                  >
                    <SelectTrigger className="w-20 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ORDER_ITEM_BATCH_VALUES.map((v) => (
                        <SelectItem key={v} value={String(v)}>
                          {batchLabel(v)}×
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    type="button"
                    variant="ghost-danger"
                    size="sm"
                    onClick={() => removeRow(index)}
                    disabled={items.length <= 1}
                    aria-label="Remove recipe"
                    className="min-h-11 min-w-11 sm:min-h-0 sm:min-w-0"
                  >
                    {/* Lucide X */}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4"
                      aria-hidden="true"
                    >
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                    <span className="sm:hidden ml-1">Remove</span>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Inline recipe picker with search dropdown ───────────────────────
function RecipePickerInput({
  value,
  displayName,
  options,
  searchQuery,
  onSearchChange,
  onSelect,
}: {
  value: string;
  displayName: string;
  options: RecipeOption[];
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Input
        type="text"
        value={open ? searchQuery : displayName}
        placeholder="Search recipes…"
        onFocus={() => {
          setOpen(true);
          onSearchChange(displayName);
        }}
        onBlur={() => {
          // Delay so click on dropdown item registers.
          setTimeout(() => setOpen(false), 200);
        }}
        onChange={(e) => onSearchChange(e.target.value)}
        autoComplete="off"
      />
      {open && options.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border bg-card shadow-lg">
          {options.slice(0, 15).map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className={`min-h-11 w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-primary/10 ${
                  r.id === value ? "font-semibold text-primary-on-card" : "text-card-foreground"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(r.id);
                  setOpen(false);
                }}
              >
                {r.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
