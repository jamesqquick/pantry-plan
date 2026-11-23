import { useId, useRef, useState } from "react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { OrderItemPicker } from "./OrderItemPicker";
import {
  formatMaterialUnit, formatMaterialUnitCost, materialLineCost, type MaterialUsage,
} from "@/features/materials/materials";
import { materialQuantitySchema } from "@/features/materials/materials.schemas";
import { formatDollars } from "@/lib/money";

export type OrderMaterialRow = { materialId: string; quantity: string; query: string };

interface OrderMaterialsEditorProps {
  options: MaterialUsage[];
  items: OrderMaterialRow[];
  onChange: (items: OrderMaterialRow[]) => void;
  onCreate: (index: number) => void;
}

export function OrderMaterialsEditor({ options, items, onChange, onCreate }: OrderMaterialsEditorProps) {
  const id = useId();
  const nextRowKey = useRef(items.length);
  const [rowKeys, setRowKeys] = useState(() => items.map((_, index) => index));

  function updateRow(index: number, patch: Partial<OrderMaterialRow>) {
    onChange(items.map((row, i) => i === index ? { ...row, ...patch } : row));
  }

  function addRow() {
    setRowKeys((keys) => [...keys, nextRowKey.current++]);
    onChange([...items, { materialId: "", quantity: "1", query: "" }]);
  }

  function removeRow(index: number) {
    if (items.length === 1) {
      onChange([{ materialId: "", quantity: "1", query: "" }]);
    } else {
      setRowKeys((keys) => keys.filter((_, i) => i !== index));
      onChange(items.filter((_, i) => i !== index));
    }
  }

  return <section aria-labelledby={`${id}-heading`} className="min-w-0 space-y-3 border-t border-border pt-6">
    <div className="flex items-center justify-between">
      <h2 id={`${id}-heading`} className="text-sm font-medium text-foreground">Materials</h2>
      <Button type="button" variant="secondary" size="sm" className="min-h-11" onClick={addRow}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="mr-1 h-3.5 w-3.5" aria-hidden="true">
          <path d="M12 5v14" /><path d="M5 12h14" />
        </svg>
        Add material
      </Button>
    </div>

    <div className="space-y-2">
      {items.map((row, index) => {
        const item = options.find((option) => option.materialId === row.materialId);
        const valid = !item || materialQuantitySchema.safeParse(Number(row.quantity)).success;
        return <div key={rowKeys[index]} className="min-w-0 space-y-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="relative min-w-0 flex-1">
              <OrderItemPicker
                label={`Material ${index + 1}`}
                value={row.materialId}
                displayName={item?.name ?? ""}
                query={row.query}
                options={options.filter((option) => option.materialId === row.materialId
                  || !items.some((other, i) => i !== index && other.materialId === option.materialId))
                  .map((option) => ({
                    id: option.materialId, name: option.name,
                    searchText: `${option.name} ${option.supplier ?? ""}`,
                    description: `${formatMaterialUnitCost(option.unitCostCents)} / ${formatMaterialUnit(option.usageUnit)}${option.supplier ? ` · ${option.supplier}` : ""}`,
                  }))}
                placeholder="Search materials…"
                emptyMessage={options.length === 0 ? "Your catalog is empty. Create a material to get started." : "No matching materials"}
                onSearchChange={(query) => updateRow(index, { materialId: "", query })}
                onSelect={(materialId) => updateRow(index, { materialId, query: "" })}
                onCreate={() => onCreate(index)}
              />
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor={`${id}-${index}`} className="sr-only">Amount used{item ? ` (${item.usageUnit === "each" ? "items" : item.usageUnit}) for ${item.name}` : ` for material ${index + 1}`}</label>
              <div className="relative w-40 shrink-0">
                <Input id={`${id}-${index}`} type="number" inputMode="decimal" min="0" max="1000000" step="any" required={!!item} value={row.quantity}
                  aria-invalid={!valid} aria-describedby={!valid ? `${id}-${index}-error` : undefined}
                  onChange={(event) => updateRow(index, { quantity: event.target.value })} className="pr-14" />
                {item && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">{formatMaterialUnit(item.usageUnit, Number(row.quantity))}</span>}
              </div>
              <Button type="button" variant="ghost-danger" size="sm" className="min-h-11 min-w-11 sm:min-h-0 sm:min-w-0" disabled={items.length === 1 && !row.materialId && !row.query && row.quantity === "1"} onClick={() => removeRow(index)} aria-label={`Remove material ${index + 1}`}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                  <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
                <span className="ml-1 sm:hidden">Remove</span>
              </Button>
            </div>
          </div>
          {item && <div className="flex flex-wrap items-center gap-x-3 text-sm tabular-nums text-muted-foreground">
            <span>{formatMaterialUnitCost(item.unitCostCents)} / {formatMaterialUnit(item.usageUnit)}</span>
            <output htmlFor={`${id}-${index}`} className="font-medium text-foreground" aria-label={`Cost for ${item.name}`}>{valid ? formatDollars(materialLineCost(item.unitCostCents, Number(row.quantity))) : "–"}</output>
            {item.productUrl && <a href={item.productUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-primary-on-background underline underline-offset-2">View product{" "}<span className="sr-only">for {item.name}, opens in a new tab</span> ↗</a>}
          </div>}
          {!valid && <p id={`${id}-${index}-error`} className="text-xs text-destructive">Enter an amount greater than 0 and no more than 1,000,000.</p>}
        </div>;
      })}
    </div>

    <p className="text-sm text-muted-foreground">Amounts are for the whole order, not per batch. Include waste and offcuts. Changing recipe batches won't change these amounts.</p>
  </section>;
}
