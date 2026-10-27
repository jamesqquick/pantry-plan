import { useState, useEffect, useRef } from "react";
import { actions } from "astro:actions";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import type { PickerIngredient, GlobalIngredientBasePrefillData } from "@/actions/ingredients";
import { INGREDIENT_UNITS, COST_BASIS_UNITS, INGREDIENT_DISPLAY_UNITS } from "@/db/schema/enums";
import { centsToDollarsInput } from "@/lib/money";

// ── Category Combobox ───────────────────────────────────────────────
// A searchable dropdown for ingredient categories.
function CategoryCombobox({
  categories,
  value,
  onChange,
}: {
  categories: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const filtered = search
    ? categories.filter((c) => c.toLowerCase().includes(search.toLowerCase()))
    : categories;

  // Close on outside click.
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Input
        type="text"
        value={open ? search : value}
        placeholder="Select category…"
        onFocus={() => {
          setOpen(true);
          setSearch(value);
        }}
        onChange={(e) => setSearch(e.target.value)}
        autoComplete="off"
      />
      {open && (
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border bg-card shadow-lg">
          <li>
            <button
              type="button"
              className="min-h-11 w-full cursor-pointer px-3 py-2 text-left text-sm text-muted-foreground hover:bg-primary/10"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange("");
                setSearch("");
                setOpen(false);
              }}
            >
              No category
            </button>
          </li>
          {filtered.map((c) => (
            <li key={c}>
              <button
                type="button"
                className={`min-h-11 w-full cursor-pointer px-3 py-2 text-left text-sm hover:bg-primary/10 ${
                  c === value ? "font-semibold text-primary-on-card" : "text-card-foreground"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(c);
                  setSearch(c);
                  setOpen(false);
                }}
              >
                {c}
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">No matching categories</li>
          )}
        </ul>
      )}
    </div>
  );
}

// ── Base Ingredient Picker ──────────────────────────────────────────
// For create mode: search global ingredients to start from.
function BaseIngredientPicker({
  onSelect,
}: {
  onSelect: (data: GlobalIngredientBasePrefillData & { id: string; name: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickerIngredient[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      const { data } = await actions.ingredients.searchGlobalForBase({ query });
      setResults(data ?? []);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function handleSelect(item: PickerIngredient) {
    const { data } = await actions.ingredients.getGlobalBasePrefill({ id: item.id });
    if (data) {
      onSelect({ ...data, id: item.id, name: item.name });
    }
    setQuery("");
    setResults([]);
  }

  return (
    <div className="relative">
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        Start from a global ingredient (optional)
      </label>
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search global catalog…"
      />
      {results.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border bg-card shadow-lg">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="w-full cursor-pointer px-3 py-2 text-left text-sm text-card-foreground hover:bg-primary/10"
                onClick={() => handleSelect(r)}
              >
                {r.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {loading && query.length >= 2 && (
        <p className="mt-1 text-xs text-muted-foreground">Searching…</p>
      )}
    </div>
  );
}

// ── Unit Labels ─────────────────────────────────────────────────────
const UNIT_LABELS: Record<string, string> = {
  COUNT: "count",
  TSP: "tsp",
  TBSP: "tbsp",
  CUP: "cup",
  OZ: "oz",
  LB: "lb",
  G: "g",
  KG: "kg",
  PINCH: "pinch",
};

const DISPLAY_UNIT_LABELS: Record<string, string> = {
  AUTO: "Auto",
  GRAM: "Grams",
  CUP: "Cups",
  EACH: "Each",
  TBSP: "Tablespoon",
  TSP: "Teaspoon",
};

// ── Form Types ──────────────────────────────────────────────────────
interface FormValues {
  name: string;
  category: string;
  defaultUnit: string;
  costBasisUnit: string;
  estimatedCost: string; // dollars, converted to cents by schema
  notes: string;
  preferredDisplayUnit: string;
  baseIngredientId: string;
}

interface CreateProps {
  mode: "create";
  categories: string[];
}

interface EditProps {
  mode: "edit";
  ingredientId: string;
  categories: string[];
  initialValues: FormValues;
}

type IngredientFormProps = CreateProps | EditProps;

const EMPTY: FormValues = {
  name: "",
  category: "",
  defaultUnit: "",
  costBasisUnit: "G",
  estimatedCost: "",
  notes: "",
  preferredDisplayUnit: "AUTO",
  baseIngredientId: "",
};

// ── Main Form ───────────────────────────────────────────────────────
export default function IngredientForm(props: IngredientFormProps) {
  const isEdit = props.mode === "edit";
  const [values, setValues] = useState<FormValues>(
    isEdit ? props.initialValues : EMPTY,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // fieldErrors reserved for future per-field validation display
  const [, setFieldErrors] = useState<Record<string, string[]>>({});

  function set<K extends keyof FormValues>(key: K, val: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: val }));
  }

  function handleBasePrefill(
    data: GlobalIngredientBasePrefillData & { id: string; name: string },
  ) {
    setValues((prev) => ({
      ...prev,
      name: prev.name || data.name,
      category: data.category ?? "",
      defaultUnit: data.defaultUnit ?? "",
      costBasisUnit: data.costBasisUnit ?? "G",
      estimatedCost: data.estimatedCentsPerBasisUnit != null
        ? centsToDollarsInput(data.estimatedCentsPerBasisUnit)
        : "",
      notes: data.notes ?? "",
      baseIngredientId: data.id,
    }));
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const fd = new FormData();
    fd.set("name", values.name);
    if (values.category) fd.set("category", values.category);
    if (values.defaultUnit) fd.set("defaultUnit", values.defaultUnit);
    fd.set("costBasisUnit", values.costBasisUnit);
    if (values.estimatedCost) fd.set("estimatedCentsPerBasisUnit", values.estimatedCost);
    if (values.notes) fd.set("notes", values.notes);

    if (isEdit) {
      fd.set("id", props.ingredientId);
      fd.set("preferredDisplayUnit", values.preferredDisplayUnit);
      const { error: err } = await actions.ingredients.update(fd);
      if (err) {
        setError(err.message);
        setSubmitting(false);
        return;
      }
      window.location.href = `/ingredients/${props.ingredientId}`;
    } else {
      if (values.baseIngredientId) {
        fd.set("baseIngredientId", values.baseIngredientId);
      }
      const { data, error: err } = await actions.ingredients.create(fd);
      if (err) {
        setError(err.message);
        setSubmitting(false);
        return;
      }
      window.location.href = `/ingredients/${data!.id}`;
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Base ingredient picker (create mode only) */}
      {!isEdit && (
        <BaseIngredientPicker onSelect={handleBasePrefill} />
      )}
      {values.baseIngredientId && !isEdit && (
        <p className="text-xs text-muted-foreground">
          Prefilled from global ingredient.{" "}
          <button
            type="button"
            className="cursor-pointer text-primary-on-card underline underline-offset-2"
            onClick={() => set("baseIngredientId", "")}
          >
            Clear
          </button>
        </p>
      )}

      {/* Name */}
      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-medium text-foreground">
          Name <span className="text-destructive">*</span>
        </label>
        <Input
          id="name"
          autoComplete="off"
          value={values.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="e.g. All-purpose flour"
          required
          maxLength={500}
        />
      </div>

      {/* Category */}
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">Category</label>
        <CategoryCombobox
          categories={props.categories}
          value={values.category}
          onChange={(v) => set("category", v)}
        />
      </div>

      {/* Default unit + Cost basis unit */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium text-foreground">Default unit</label>
          <Select
            value={values.defaultUnit || "__none__"}
            onValueChange={(v) => set("defaultUnit", v === "__none__" ? "" : v)}
          >
            <SelectTrigger className="min-h-11">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None</SelectItem>
              {INGREDIENT_UNITS.map((u) => (
                <SelectItem key={u} value={u}>
                  {UNIT_LABELS[u] ?? u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium text-foreground">
            Cost basis unit <span className="text-destructive">*</span>
          </label>
          <Select
            value={values.costBasisUnit}
            onValueChange={(v) => set("costBasisUnit", v)}
          >
            <SelectTrigger className="min-h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COST_BASIS_UNITS.map((u) => (
                <SelectItem key={u} value={u}>
                  {UNIT_LABELS[u] ?? u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Estimated cost */}
      <div>
        <label htmlFor="estimatedCost" className="mb-1 block text-sm font-medium text-foreground">
          Estimated cost{" "}
          <span className="font-normal text-muted-foreground">
            ($ per {UNIT_LABELS[values.costBasisUnit] ?? values.costBasisUnit})
          </span>
        </label>
        <Input
          id="estimatedCost"
          type="number"
          inputMode="decimal"
          autoComplete="off"
          step="0.01"
          min="0"
          value={values.estimatedCost}
          onChange={(e) => set("estimatedCost", e.target.value)}
          placeholder="0.00"
          className="w-full sm:w-32"
        />
      </div>

      {/* Preferred display unit (edit only) */}
      {isEdit && (
        <div>
          <label className="mb-1 block text-sm font-medium text-foreground">
            Preferred display unit
          </label>
          <Select
            value={values.preferredDisplayUnit}
            onValueChange={(v) => set("preferredDisplayUnit", v)}
          >
            <SelectTrigger className="min-h-11 w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INGREDIENT_DISPLAY_UNITS.map((u) => (
                <SelectItem key={u} value={u}>
                  {DISPLAY_UNIT_LABELS[u] ?? u}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Notes */}
      <div>
        <label htmlFor="notes" className="mb-1 block text-sm font-medium text-foreground">
          Notes{" "}
          <span className="font-normal text-muted-foreground">(supports Markdown)</span>
        </label>
        <Textarea
          id="notes"
          value={values.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Substitutions, tips, storage info…"
          rows={4}
          maxLength={2000}
        />
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" disabled={submitting}>
          {submitting
            ? isEdit
              ? "Saving…"
              : "Creating…"
            : isEdit
              ? "Save changes"
              : "Create ingredient"}
        </Button>
        <Button
          variant="secondary"
          href={isEdit ? `/ingredients/${(props as EditProps).ingredientId}` : "/ingredients"}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
