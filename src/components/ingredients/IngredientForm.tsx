import { useState, useEffect, useRef, useId, type ComponentProps, type SyntheticEvent } from "react";
import { actions, isInputError } from "astro:actions";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import type { PickerIngredient, GlobalIngredientBasePrefillData } from "@/actions/ingredients";
import { PURCHASE_UNITS, VOLUME_UNITS, type IngredientDisplayUnit } from "@/db/schema/enums";
import { ingredientCreateSchema } from "@/features/ingredients/ingredients.schemas";
import { ingredientFormValues, type IngredientFormValues } from "@/features/ingredients/ingredients.form";
import { convertToBasis, lineVolumeToCups } from "@/lib/grocery/canonical";
import { formatIngredientCost } from "@/lib/ingredients/pricing";
import { dollarsToCents } from "@/lib/money";
import { DISPLAY_UNIT_LABELS, UNIT_LABELS } from "@/lib/ingredients/units";
import { formatQuantity } from "@/lib/quantity/quantity";
import { IngredientFormHelp } from "./IngredientFormHelp";
import "./IngredientForm.css";

function BaseIngredientPicker({
  onSelect,
}: {
  onSelect: (data: GlobalIngredientBasePrefillData & { id: string; name: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickerIngredient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  useEffect(() => {
    let active = true;
    setError(null);
    if (query.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const { data, error } = await actions.ingredients.searchGlobalForBase({ query });
        if (!active) return;
        setResults(data ?? []);
        if (error) setError("Could not search the catalog. Try again.");
      } catch {
        if (active) setError("Could not search the catalog. Check your connection and try again.");
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => { active = false; clearTimeout(t); };
  }, [query]);

  async function handleSelect(item: PickerIngredient) {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await actions.ingredients.getGlobalBasePrefill({ id: item.id });
      if (error || !data) {
        setError("Could not load this ingredient. Try again.");
        return;
      }
      onSelect({ ...data, id: item.id, name: item.name });
      setQuery("");
      setResults([]);
    } catch {
      setError("Could not load this ingredient. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <label htmlFor={id}>Search the global catalog</label>
      <Input
        id={id}
        className="ingredient-control"
        type="search"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setResults([]); }}
        onKeyDown={(e) => { if (e.key === "Escape") setResults([]); }}
        placeholder="Search global catalog…"
        autoComplete="off"
      />
      {results.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border bg-card shadow-lg">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="min-h-11 w-full cursor-pointer px-3 py-2 text-left text-base text-card-foreground hover:bg-primary/10"
                disabled={loading}
                onClick={() => handleSelect(r)}
              >
                {r.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-meta text-muted-foreground" role="status">{loading ? "Loading…" : error}</p>
    </div>
  );
}

type IngredientFormProps = { categories: string[] } & (
  | { mode: "create" }
  | { mode: "edit"; ingredientId: string; initialValues: IngredientFormValues }
);
type Field = keyof IngredientFormValues;
type FieldErrors = Partial<Record<Field, string>>;

const DISPLAY_CHOICES: IngredientDisplayUnit[] = ["AUTO", "EACH", "GRAM", "KG", "OZ", "LB", "CUP"];
const SHOPPING_UNIT_NAMES = {
  EACH: "count", GRAM: "grams", KG: "kilograms", OZ: "ounces", LB: "pounds",
  CUP: "cups", TBSP: "tablespoons", TSP: "teaspoons",
};

function FieldError({ field, message }: { field: Field; message?: string }) {
  return <p className="ingredient-error" id={`${field}-error`} hidden={!message}>{message}</p>;
}

function costExample(values: IngredientFormValues) {
  const price = Number(values.purchasePrice);
  const quantity = Number(values.purchaseQuantity);
  if (!(price > 0 && quantity > 0 && Number.isFinite(price) && Number.isFinite(quantity))) return null;
  const amount = Number(values.volumeAmount);
  const weight = Number(values.volumeWeightGrams);
  const cups = lineVolumeToCups(amount, values.volumeUnit)!;
  const gramsPerCup = weight / cups;
  const converted = amount > 0 && weight > 0 && Number.isFinite(gramsPerCup) && gramsPerCup > 0
    ? convertToBasis({
      quantity: amount, unit: values.volumeUnit, basisUnit: values.purchaseUnit,
      ingredientConversion: { gramsPerCup, gramsPerEach: Number(values.gramsPerEach) || null },
    }) : null;
  const sample = { COUNT: 2, G: 100, KG: 0.1, OZ: 1, LB: 0.5, CUP: 0.5 }[values.purchaseUnit];
  const cost = dollarsToCents(price) / quantity * (converted?.basisQty ?? sample);
  if (!Number.isFinite(cost) || cost <= 0) return null;
  return {
    amount: formatQuantity(converted ? amount : sample),
    unit: UNIT_LABELS[converted ? values.volumeUnit : values.purchaseUnit],
    cost,
  };
}

export default function IngredientForm(props: IngredientFormProps) {
  const isEdit = props.mode === "edit";
  const initialValues = isEdit ? props.initialValues : ingredientFormValues();
  const [values, setValues] = useState<IngredientFormValues>(initialValues);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [error, setError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const validation = ingredientCreateSchema.safeParse({ ...values, baseIngredientId: values.baseIngredientId || undefined });
  const errors: FieldErrors = {};
  if (!validation.success) {
    for (const issue of validation.error.issues) {
      const field = issue.path[0] as Field;
      errors[field] ??= issue.message;
    }
  }
  for (const [field, message] of Object.entries(serverErrors)) {
    if (message) errors[field as Field] = message;
  }

  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  function set<K extends Field>(key: K, val: IngredientFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: val }));
    setServerErrors((prev) => ({ ...prev, [key]: undefined }));
    setError(null);
  }

  function shownError(field: Field) {
    return submitted || touched[field] || serverErrors[field] ? errors[field] : undefined;
  }

  function numberInput(field: "purchasePrice" | "purchaseQuantity" | "volumeAmount" | "volumeWeightGrams" | "gramsPerEach", label: string): ComponentProps<typeof Input> {
    return {
      name: field, type: "text", inputMode: "decimal", autoComplete: "off", spellCheck: false,
      required: field !== "gramsPerEach", value: values[field], "aria-label": label,
      "aria-invalid": shownError(field) ? true : undefined,
      "aria-describedby": `${field}-error`,
      onChange: (event) => {
        const value = event.target.value;
        if (!/^\d*\.?\d*$/.test(value) || (value !== "." && !Number.isFinite(Number(value)))) return;
        set(field, value);
      },
    };
  }

  function focusFirstError(fieldErrors: FieldErrors) {
    for (const element of Array.from(formRef.current?.elements ?? [])) {
      if (element instanceof HTMLElement && fieldErrors[element.getAttribute("name") as Field]) {
        element.focus();
        return;
      }
    }
  }

  function handleBasePrefill(
    data: GlobalIngredientBasePrefillData & { id: string; name: string },
  ) {
    setValues({
      ...ingredientFormValues(data),
      name: `${data.name} copy`,
      baseIngredientId: data.id,
    });
    setTouched({});
    setServerErrors({});
    setError(null);
  }

  async function handleSubmit(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitted(true);
    setError(null);
    if (Object.values(errors).some(Boolean)) {
      focusFirstError(errors);
      return;
    }
    setSubmitting(true);

    const fd = new FormData();
    for (const [key, value] of Object.entries(values)) {
      if (key !== "baseIngredientId" || value) fd.set(key, value);
    }
    if (isEdit) fd.set("id", props.ingredientId);
    try {
      const result = isEdit ? await actions.ingredients.update(fd) : await actions.ingredients.create(fd);
      if (result.error) {
        if (isInputError(result.error)) {
          const fields = Object.fromEntries(Object.entries(result.error.fields).map(([key, messages]) => [key, messages?.[0]])) as FieldErrors;
          setServerErrors(fields);
          window.requestAnimationFrame(() => focusFirstError(fields));
        } else {
          setError(result.error.message || "Could not save this ingredient. Try again.");
        }
        return;
      }
      window.location.href = `/ingredients/${result.data!.id}`;
    } catch {
      setError("Could not save this ingredient. Check your connection and try again. Your entries are still here.");
    } finally {
      setSubmitting(false);
    }
  }

  const hasItemWeight = Number(values.gramsPerEach) > 0 && !errors.gramsPerEach;
  const purchaseDisplay = values.purchaseUnit === "COUNT" ? "EACH" : values.purchaseUnit === "G" ? "GRAM" : values.purchaseUnit;
  const automatic = hasItemWeight ? "EACH" : purchaseDisplay;
  const preferred = values.preferredDisplayUnit;
  const needsItemWeight = preferred !== "AUTO" && !hasItemWeight &&
    ((preferred === "EACH" && purchaseDisplay !== "EACH") || (purchaseDisplay === "EACH" && preferred !== "EACH"));
  const displayHelp = needsItemWeight
    ? `Add weight per item to show shopping amounts in ${SHOPPING_UNIT_NAMES[preferred as Exclude<IngredientDisplayUnit, "AUTO">]}. Until then, use ${SHOPPING_UNIT_NAMES[purchaseDisplay]}.`
    : preferred === "AUTO" ? `For this ingredient, Auto uses ${SHOPPING_UNIT_NAMES[automatic]}.`
      : `Shopping amounts will use ${SHOPPING_UNIT_NAMES[preferred]} when the measurements are available.`;
  const example = costExample(values);
  const displayChoices = DISPLAY_CHOICES.includes(preferred) ? DISPLAY_CHOICES : [...DISPLAY_CHOICES, preferred];

  return (
    <form ref={formRef} onSubmit={handleSubmit} noValidate className="ingredient-form" aria-busy={submitting}
      onBlur={(event) => {
        const field = event.target.getAttribute("name") as Field;
        if (field && field in values) setTouched((prev) => ({ ...prev, [field]: true }));
      }}>
      {error && (
        <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-base text-primary-on-card">
          {error}
        </div>
      )}

      <fieldset className="ingredient-fields" disabled={submitting} aria-label="Ingredient details">
        {!isEdit && (
          <div className="ingredient-base">
            <BaseIngredientPicker onSelect={handleBasePrefill} />
          </div>
        )}

        <div className="ingredient-two-up">
          <div>
            <label htmlFor="name">Name <span className="ingredient-required" aria-hidden="true">*</span></label>
            <Input id="name" name="name" className="ingredient-control" autoComplete="off" value={values.name}
              onChange={(e) => set("name", e.target.value)} placeholder="e.g. All-purpose flour" required maxLength={500}
              aria-invalid={shownError("name") ? true : undefined} aria-describedby="name-error" />
            <FieldError field="name" message={shownError("name")} />
          </div>
          <div>
            <label htmlFor="category">Category</label>
            <select id="category" name="category" className="ingredient-control" value={values.category}
              onChange={(e) => set("category", e.target.value)} aria-invalid={shownError("category") ? true : undefined} aria-describedby="category-error">
              <option value="">No category</option>
              {props.categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
            <FieldError field="category" message={shownError("category")} />
          </div>
        </div>

        <fieldset>
          <legend><span className="ingredient-heading"><span>Cost <span className="ingredient-required" aria-hidden="true">*</span></span>
            <IngredientFormHelp label="About purchase price">Recipe and order estimates use only the amount needed, rather than the whole package price. Update this when your usual price changes.</IngredientFormHelp>
          </span></legend>
          <div className="ingredient-equation ingredient-purchase">
            <div className="ingredient-measure"><span className="ingredient-prefix" aria-hidden="true">$</span>
              <Input id="price" {...numberInput("purchasePrice", "Price paid in dollars")} placeholder="0.00" />
            </div>
            <span className="ingredient-joiner">for</span>
            <div className="ingredient-measure">
              <Input id="package-quantity" {...numberInput("purchaseQuantity", "Amount bought")} />
              <select id="package-unit" name="purchaseUnit" value={values.purchaseUnit} aria-label="Purchase unit"
                aria-invalid={shownError("purchaseUnit") ? true : undefined} aria-describedby="purchaseUnit-error"
                onChange={(e) => set("purchaseUnit", e.target.value as IngredientFormValues["purchaseUnit"])}>
                {PURCHASE_UNITS.map((unit) => <option key={unit} value={unit}>{UNIT_LABELS[unit]}</option>)}
              </select>
            </div>
          </div>
          <FieldError field="purchasePrice" message={shownError("purchasePrice")} />
          <FieldError field="purchaseQuantity" message={shownError("purchaseQuantity")} />
          <FieldError field="purchaseUnit" message={shownError("purchaseUnit")} />
        </fieldset>

        <fieldset aria-label="Measurement conversions">
          <div className="ingredient-conversions">
            <div>
              <div className="ingredient-heading"><label htmlFor="volume-weight">Volume to weight <span className="ingredient-required" aria-hidden="true">*</span></label>
                <IngredientFormHelp label="About volume to weight">Turn cups and spoonfuls in recipes into shopping weights and cost estimates. Look for a serving size such as ¼ cup (30 g) on the Nutrition Facts label, then enter 0.25 cup = 30 g. Use the grams beside the serving size, not a nutrient or the whole package. If no volume is listed, weigh the amount shown.</IngredientFormHelp>
              </div>
              <div className="ingredient-equation">
                <div className="ingredient-measure">
                  <Input id="volume-amount" {...numberInput("volumeAmount", "Volume amount")} />
                  <select id="volume-unit" name="volumeUnit" aria-label="Volume unit" value={values.volumeUnit}
                    aria-invalid={shownError("volumeUnit") ? true : undefined} aria-describedby="volumeUnit-error"
                    onChange={(e) => set("volumeUnit", e.target.value as IngredientFormValues["volumeUnit"])}>
                    {VOLUME_UNITS.map((unit) => <option key={unit} value={unit}>{UNIT_LABELS[unit]}</option>)}
                  </select>
                </div>
                <span className="ingredient-joiner">=</span>
                <div className="ingredient-measure">
                  <Input id="volume-weight" {...numberInput("volumeWeightGrams", "Weight of the volume shown in grams")} />
                  <span className="ingredient-suffix" aria-hidden="true">g</span>
                </div>
              </div>
              <FieldError field="volumeAmount" message={shownError("volumeAmount")} />
              <FieldError field="volumeWeightGrams" message={shownError("volumeWeightGrams")} />
              <FieldError field="volumeUnit" message={shownError("volumeUnit")} />
            </div>
            <div>
              <div className="ingredient-heading"><label htmlFor="item-weight">Weight per item</label>
                <IngredientFormHelp label="About weight per item">Use this to cost and shop for recipes that count ingredients, such as onions sold by weight. Weigh one item as you use it. Skip this for ingredients you don't count.</IngredientFormHelp>
              </div>
              <div className="ingredient-measure">
                <Input id="item-weight" {...numberInput("gramsPerEach", "Weight per item in grams")} />
                <span className="ingredient-suffix" aria-hidden="true">g</span>
              </div>
              <FieldError field="gramsPerEach" message={shownError("gramsPerEach")} />
            </div>
          </div>
          <output className="ingredient-example" aria-live="polite" aria-atomic="true" hidden={!example}>
            {example && <>In a recipe, {example.amount} {example.unit} would cost {example.cost < 0.01 ? "" : "about "}<strong>{formatIngredientCost(example.cost)}</strong>.</>}
          </output>
        </fieldset>

        <div>
          <div className="ingredient-heading"><label htmlFor="display-unit">Grocery list unit</label>
            <IngredientFormHelp label="About grocery list unit">Make your list easier to shop from: choose pounds for flour or count for eggs. Auto uses count when an item weight is available, otherwise the unit you bought.</IngredientFormHelp>
          </div>
          <select id="display-unit" name="preferredDisplayUnit" className="ingredient-control" value={preferred}
            onChange={(e) => set("preferredDisplayUnit", e.target.value as IngredientDisplayUnit)}
            aria-invalid={shownError("preferredDisplayUnit") ? true : undefined} aria-describedby="display-help preferredDisplayUnit-error">
            {displayChoices.map((unit) => <option key={unit} value={unit}>{DISPLAY_UNIT_LABELS[unit]}</option>)}
          </select>
          <p id="display-help" className="ingredient-display-help">{displayHelp}</p>
          <FieldError field="preferredDisplayUnit" message={shownError("preferredDisplayUnit")} />
        </div>

        <div>
          <div className="ingredient-heading"><label htmlFor="notes">Notes</label>
            <IngredientFormHelp label="About ingredient notes">Keep details you would otherwise look up again, like a brand you prefer, storage advice, or a substitution that worked. You can use Markdown for formatting.</IngredientFormHelp>
          </div>
          <Textarea id="notes" name="notes" className="ingredient-control" value={values.notes}
            onChange={(e) => set("notes", e.target.value)} placeholder="e.g. Store in an airtight container after opening."
            rows={3} maxLength={2000} aria-invalid={shownError("notes") ? true : undefined} aria-describedby="notes-error" />
          <FieldError field="notes" message={shownError("notes")} />
        </div>
      </fieldset>

      <div className="ingredient-actions">
        <p className="ingredient-save-note" role="status" aria-atomic="true">{submitted && Object.values(errors).some(Boolean) ? "Check the highlighted fields before saving." : ""}</p>
        <div className="ingredient-buttons">
          <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : isEdit ? "Save changes" : "Create ingredient"}</Button>
          {isEdit ? (
            <Button variant="secondary" disabled={submitting} onClick={() => {
              setValues(initialValues); setTouched({}); setServerErrors({}); setSubmitted(false); setError(null);
            }}>Reset changes</Button>
          ) : <Button variant="secondary" href="/ingredients">Cancel</Button>}
        </div>
      </div>
    </form>
  );
}
