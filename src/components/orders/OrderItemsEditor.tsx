import { useId, useRef, useState } from "react";
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
  const nextRowKey = useRef(items.length);
  const [rowKeys, setRowKeys] = useState(() => items.map((_, index) => index));

  function addRow() {
    setRowKeys((keys) => [...keys, nextRowKey.current++]);
    onChange([...items, { recipeId: "", batches: 1 }]);
  }

  function removeRow(index: number) {
    if (items.length <= 1) return;
    setRowKeys((keys) => keys.filter((_, i) => i !== index));
    onChange(items.filter((_, i) => i !== index));
  }

  function updateRow(index: number, patch: Partial<OrderItemRow>) {
    const next = [...items];
    next[index] = { ...next[index]!, ...patch };
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-foreground">
          Recipes & batches
        </h2>
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
        <p className="text-body text-muted-foreground">
          No items. Add at least one recipe.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((row, index) => {
            const selectedRecipe = recipeOptions.find((r) => r.id === row.recipeId);
            return (
              <div
                key={rowKeys[index]}
                className="flex flex-col gap-2 sm:flex-row sm:items-center"
              >
                {/* Recipe picker */}
                <div className="relative min-w-0 flex-1">
                  <RecipePickerInput
                    label={`Recipe ${index + 1}`}
                    value={row.recipeId}
                    displayName={selectedRecipe?.title ?? ""}
                    options={recipeOptions.filter(
                      (r) =>
                        r.id === row.recipeId ||
                        !items.some((item, i) => i !== index && item.recipeId === r.id),
                    )}
                    onSelect={(id) => updateRow(index, { recipeId: id })}
                  />
                </div>

                {/* Batches + remove */}
                <div className="flex items-center gap-2">
                  <Select
                    value={String(row.batches)}
                    onValueChange={(v) => updateRow(index, { batches: Number(v) })}
                  >
                    <SelectTrigger
                      aria-label={`Batches for ${selectedRecipe?.title ?? `recipe ${index + 1}`}`}
                      className="w-20 shrink-0"
                    >
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
                    aria-label={`Remove recipe ${index + 1}`}
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
  label,
  value,
  displayName,
  options,
  onSelect,
}: {
  label: string;
  value: string;
  displayName: string;
  options: RecipeOption[];
  onSelect: (id: string) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const matches = options
    .filter((r) => r.title.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 15);

  function selectRecipe(id: string) {
    onSelect(id);
    setQuery("");
    setOpen(false);
  }

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <label htmlFor={id} className="sr-only">{label}</label>
      <Input
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? `${id}-options` : undefined}
        aria-activedescendant={open && activeIndex >= 0 && matches.length > 0
          ? `${id}-option-${Math.min(activeIndex, matches.length - 1)}`
          : undefined}
        value={open ? query : displayName}
        placeholder="Search recipes…"
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setActiveIndex(-1);
        }}
        onChange={(event) => {
          setOpen(true);
          setQuery(event.target.value);
          setActiveIndex(-1);
          if (value) onSelect("");
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (!open && event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
            event.preventDefault();
            setQuery(event.key);
            setActiveIndex(-1);
            setOpen(true);
            if (value) onSelect("");
          } else if (event.key === "Escape") {
            setOpen(false);
            event.currentTarget.blur();
          } else if (event.key === "ArrowDown" && matches.length > 0) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((index) => Math.min(index + 1, matches.length - 1));
          } else if (event.key === "ArrowUp" && matches.length > 0) {
            event.preventDefault();
            setOpen(true);
            setActiveIndex((index) => index < 0 ? matches.length - 1 : Math.max(index - 1, 0));
          } else if (event.key === "Enter" && open && matches.length > 0) {
            event.preventDefault();
            selectRecipe(matches[Math.max(0, Math.min(activeIndex, matches.length - 1))]!.id);
          }
        }}
        autoComplete="off"
      />
      {open && (
        <ul
          id={`${id}-options`}
          role="listbox"
          aria-label={label}
          className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border bg-card shadow-lg"
        >
          {matches.map((r, index) => (
            <li
              key={r.id}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={r.id === value}
              className={`min-h-11 cursor-pointer px-3 py-2 text-body hover:bg-primary/10 ${index === activeIndex ? "bg-primary/10" : ""} ${r.id === value ? "font-semibold text-primary-on-card" : "text-card-foreground"}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectRecipe(r.id)}
            >
              {r.title}
            </li>
          ))}
          {matches.length === 0 && <li role="presentation" className="px-3 py-2 text-body text-muted-foreground">No matching recipes</li>}
        </ul>
      )}
    </div>
  );
}
