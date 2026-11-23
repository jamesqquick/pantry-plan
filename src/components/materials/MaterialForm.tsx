import { useRef, useState, type SyntheticEvent } from "react";
import { actions } from "astro:actions";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { MobileFormActions, mobileFormActionButtonClass } from "@/components/ui/MobileFormActions";
import { materialCreateSchema, materialQuantitySchema } from "@/features/materials/materials.schemas";
import {
  MATERIAL_CATEGORIES, MATERIAL_UNIT_GROUPS, MATERIAL_UNIT_LABELS,
  formatMaterialUnit, formatMaterialUnitCost, type MaterialUnit,
} from "@/features/materials/materials";
import { centsToDollarsInput, dollarsInputToCents } from "@/lib/money";
import { getSafeActionErrorMessage } from "@/lib/safe-action-error";
import type { Material } from "@/db/schema/materials";

type MaterialFormProps = {
  initialMaterial?: Material;
  onSaved?: (material: Material) => void;
  onCancel?: () => void;
};

const SAVE_ERROR = "Couldn't save the material. Check your connection and try again.";
const selectClass = "min-h-11 w-full rounded-input border border-input bg-card px-3 text-body focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function MaterialForm({ initialMaterial, onSaved, onCancel }: MaterialFormProps) {
  const [name, setName] = useState(initialMaterial?.name ?? "");
  const [category, setCategory] = useState(initialMaterial?.category ?? MATERIAL_CATEGORIES[0]);
  const [usageUnit, setUsageUnit] = useState<MaterialUnit>(initialMaterial?.usageUnit ?? "each");
  const [quantity, setQuantity] = useState(initialMaterial ? String(initialMaterial.packageQuantity) : "");
  const [price, setPrice] = useState(initialMaterial ? centsToDollarsInput(initialMaterial.packagePriceCents) : "");
  const [supplier, setSupplier] = useState(initialMaterial?.supplier ?? "");
  const [productUrl, setProductUrl] = useState(initialMaterial?.productUrl ?? "");
  const [notes, setNotes] = useState(initialMaterial?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const validation = materialCreateSchema.safeParse({
    name, category, usageUnit, packageQuantity: Number(quantity),
    packagePriceCents: dollarsInputToCents(price) ?? NaN, supplier, productUrl, notes,
  });
  const packagePriceCents = dollarsInputToCents(price);
  const previewRate = packagePriceCents !== null && packagePriceCents <= 100_000_000
    && materialQuantitySchema.safeParse(Number(quantity)).success ? packagePriceCents / Number(quantity) : NaN;
  const unitCost = Number.isFinite(previewRate) ? previewRate : null;

  function showError(message: string) {
    setError(message);
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (dollarsInputToCents(price) === null) {
      showError("Enter a package price with up to 2 decimal places.");
      return;
    }
    if (!validation.success) {
      showError(validation.error.issues[0]!.message);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = initialMaterial
        ? await actions.materials.update({ id: initialMaterial.id, ...validation.data })
        : await actions.materials.create(validation.data);
      if (result.error || !result.data) {
        showError(getSafeActionErrorMessage(result.error, SAVE_ERROR));
      } else if (onSaved) {
        onSaved(result.data);
      } else {
        window.location.href = "/materials";
      }
    } catch {
      showError(SAVE_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
      <form onSubmit={handleSubmit} className="min-w-0 space-y-7">
        {error && <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-destructive">{error}</div>}
        <fieldset disabled={submitting} className="min-w-0 space-y-5">
          <legend className="mb-4 font-display text-xl">The basics</legend>
          <div className="space-y-1.5">
            <label htmlFor="material-name" className="text-sm font-medium">Material name <span aria-hidden="true">*</span></label>
            <Input id="material-name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kraft wrapping paper, 18-inch wide" className="min-h-11" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="material-category" className="text-sm font-medium">Category <span aria-hidden="true">*</span></label>
            <select id="material-category" className={selectClass} value={category} onChange={(e) => setCategory(e.target.value)}>
              {MATERIAL_CATEGORIES.map((item) => <option key={item}>{item}</option>)}
            </select>
          </div>
        </fieldset>

        <fieldset disabled={submitting} className="min-w-0 space-y-5 border-t border-border pt-6">
          <legend className="float-left mb-3 w-full font-display text-xl">How you buy it</legend>
          <p className="clear-both text-sm text-muted-foreground">Use the total amount and price for the whole purchase, including every roll, sleeve, or pack.</p>
          <div className="space-y-1.5">
            <label htmlFor="material-unit" className="text-sm font-medium">Usage unit <span aria-hidden="true">*</span></label>
            <select id="material-unit" className={selectClass} value={usageUnit} onChange={(e) => setUsageUnit(e.target.value as MaterialUnit)}>
              {MATERIAL_UNIT_GROUPS.map((group) => <optgroup key={group.label} label={group.label}>
                {group.units.map((unit) => <option key={unit} value={unit}>{MATERIAL_UNIT_LABELS[unit]}</option>)}
              </optgroup>)}
            </select>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="material-quantity" className="text-sm font-medium">Total amount in package <span aria-hidden="true">*</span></label>
              <Input id="material-quantity" type="number" inputMode="decimal" required min="0" max="1000000" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="min-h-11" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="material-price" className="text-sm font-medium">Package price ($) <span aria-hidden="true">*</span></label>
              <Input id="material-price" inputMode="decimal" required value={price} onChange={(e) => setPrice(e.target.value)} className="min-h-11" />
            </div>
          </div>
        </fieldset>

        <fieldset disabled={submitting} className="min-w-0 space-y-5 border-t border-border pt-6">
          <legend className="float-left mb-3 w-full font-display text-xl">A few extra details <span className="font-sans text-sm text-muted-foreground">Optional</span></legend>
          <div className="clear-both space-y-1.5">
            <label htmlFor="material-supplier" className="text-sm font-medium">Supplier</label>
            <Input id="material-supplier" maxLength={120} value={supplier} onChange={(e) => setSupplier(e.target.value)} className="min-h-11" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="material-product-url" className="text-sm font-medium">Product URL</label>
            <Input id="material-product-url" type="url" maxLength={2048} value={productUrl} onChange={(e) => setProductUrl(e.target.value)} placeholder="https://shop.example.com/product" className="min-h-11" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="material-notes" className="text-sm font-medium">Notes</label>
            <Textarea id="material-notes" maxLength={500} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </fieldset>

        <MobileFormActions className="sm:justify-start">
          <Button type="submit" disabled={submitting} className={mobileFormActionButtonClass}>{submitting ? "Saving…" : onSaved ? "Save and add to order" : "Save material"}</Button>
          {onCancel ? <Button variant="secondary" onClick={onCancel} disabled={submitting} className={mobileFormActionButtonClass}>Cancel</Button>
            : <Button variant="secondary" href="/materials" className={mobileFormActionButtonClass}>Cancel</Button>}
        </MobileFormActions>
      </form>

      <aside aria-label="Material cost preview" className="min-w-0 space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="space-y-5 rounded-xl border border-border bg-panel p-6">
          <p className="text-sm font-semibold text-muted-foreground">Cost preview</p>
          <h2 className="break-words font-display text-2xl">{name.trim() || "Your material"}</h2>
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-y border-border py-4" aria-live="polite">
            <span className="text-sm">Cost per {formatMaterialUnit(usageUnit)}</span>
            {unitCost !== null && <strong className="break-all text-xl tabular-nums">{formatMaterialUnitCost(unitCost)}</strong>}
          </div>
          <p className="text-sm text-muted-foreground">Unit costs keep fractional cents. Each order line rounds to the nearest cent.</p>
        </div>
        <p className="text-sm text-muted-foreground">Material prices are saved with each order, so future price changes won't rewrite past costs.</p>
      </aside>
    </div>
  );
}
