import { useState } from "react";
import { actions } from "astro:actions";
import { INGREDIENT_UNITS, type IngredientUnit } from "@/db/schema/enums";
import { parseQuantityText } from "@/lib/quantity/quantity";
import { cn } from "@/lib/utils";

export type RecipeFormMode = "create" | "edit";

export type RecipeIngredientDraft = {
  displayText: string;
  quantityText: string;
  unit: IngredientUnit | "";
  rawText: string | null;
  ingredientId: string | null;
};

export interface RecipeFormInitial {
  id?: string;
  title: string;
  sourceUrl: string;
  imageUrl: string;
  servings: string;
  prepTimeMinutes: string;
  cookTimeMinutes: string;
  totalTimeMinutes: string;
  notes: string;
  instructions: string[];
  ingredients: RecipeIngredientDraft[];
  tagIds: string[];
}

export interface RecipeFormProps {
  mode: RecipeFormMode;
  initial: RecipeFormInitial;
  allTags: { id: string; name: string }[];
}

/** Blank ingredient row for the repeater. */
function emptyIngredient(): RecipeIngredientDraft {
  return {
    displayText: "",
    quantityText: "",
    unit: "",
    rawText: null,
    ingredientId: null,
  };
}

/** Parse a numeric-ish form field to int|undefined for the action payload. */
function parseIntOr(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  const n = parseInt(trimmed, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export default function RecipeForm({
  mode,
  initial,
  allTags,
}: RecipeFormProps) {
  const [title, setTitle] = useState(initial.title);
  const [sourceUrl, setSourceUrl] = useState(initial.sourceUrl);
  const [imageUrl, setImageUrl] = useState(initial.imageUrl);
  const [servings, setServings] = useState(initial.servings);
  const [prepTime, setPrepTime] = useState(initial.prepTimeMinutes);
  const [cookTime, setCookTime] = useState(initial.cookTimeMinutes);
  const [totalTime, setTotalTime] = useState(initial.totalTimeMinutes);
  const [notes, setNotes] = useState(initial.notes);
  const [instructions, setInstructions] = useState<string[]>(
    initial.instructions.length > 0 ? initial.instructions : [""]
  );
  const [ingredients, setIngredients] = useState<RecipeIngredientDraft[]>(
    initial.ingredients.length > 0 ? initial.ingredients : [emptyIngredient()]
  );
  const [tagIds, setTagIds] = useState<Set<string>>(
    new Set(initial.tagIds)
  );

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function setInstruction(idx: number, value: string) {
    setInstructions((prev) => prev.map((s, i) => (i === idx ? value : s)));
  }
  function addInstruction() {
    setInstructions((prev) => [...prev, ""]);
  }
  function removeInstruction(idx: number) {
    setInstructions((prev) =>
      prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)
    );
  }

  function setIngredient(idx: number, patch: Partial<RecipeIngredientDraft>) {
    setIngredients((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, ...patch } : row))
    );
  }
  function addIngredient() {
    setIngredients((prev) => [...prev, emptyIngredient()]);
  }
  function removeIngredient(idx: number) {
    setIngredients((prev) =>
      prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)
    );
  }

  function toggleTag(id: string) {
    setTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});

    // Build payload. Shape must match features/recipes/recipes.schemas.ts
    // extended with ingredientsStructured (see src/actions/recipes.ts).
    const cleanInstructions = instructions.map((s) => s.trim()).filter(Boolean);
    const cleanIngredients = ingredients
      .filter((r) => r.displayText.trim() !== "" || r.quantityText.trim() !== "")
      .map((r, idx) => {
        const qty = parseQuantityText(r.quantityText);
        return {
          sortOrder: idx,
          displayText: r.displayText.trim() || "—",
          rawText: r.rawText ?? null,
          quantity: qty ?? null,
          unit: r.unit === "" ? null : r.unit,
          ingredientId: r.ingredientId ?? "",
        };
      });

    const payload = {
      title: title.trim(),
      sourceUrl: sourceUrl.trim(),
      imageUrl: imageUrl.trim(),
      servings: parseIntOr(servings),
      prepTimeMinutes: parseIntOr(prepTime),
      cookTimeMinutes: parseIntOr(cookTime),
      totalTimeMinutes: parseIntOr(totalTime),
      notes: notes.trim() || undefined,
      ingredients: [],
      instructions: cleanInstructions,
      ingredientsStructured: cleanIngredients,
      tagIds: Array.from(tagIds),
    };

    if (mode === "create") {
      const { data, error: err } = await actions.recipes.create(payload);
      if (err) {
        setError(err.message || "Could not create recipe");
        if ("fields" in err && err.fields) {
          setFieldErrors(err.fields as Record<string, string[]>);
        }
        setPending(false);
        return;
      }
      if (data) {
        window.location.href = `/recipes/${data.id}`;
      }
    } else {
      if (!initial.id) {
        setError("Missing recipe id");
        setPending(false);
        return;
      }
      const { data, error: err } = await actions.recipes.update({
        ...payload,
        id: initial.id,
      });
      if (err) {
        setError(err.message || "Could not update recipe");
        if ("fields" in err && err.fields) {
          setFieldErrors(err.fields as Record<string, string[]>);
        }
        setPending(false);
        return;
      }
      if (data) {
        window.location.href = `/recipes/${data.id}`;
      }
    }
  }

  const inputClass =
    "w-full rounded-input border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <form onSubmit={handleSubmit} className="space-y-8" noValidate>
      <section className="space-y-4">
        <div>
          <label htmlFor="title" className="mb-1 block text-sm font-medium">
            Title
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
            aria-invalid={!!fieldErrors.title}
          />
          {fieldErrors.title?.[0] && (
            <p className="mt-1 text-xs text-destructive">{fieldErrors.title[0]}</p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="sourceUrl" className="mb-1 block text-sm font-medium">
              Source URL
              <span className="ml-1 text-muted-foreground">(optional)</span>
            </label>
            <input
              id="sourceUrl"
              name="sourceUrl"
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              className={inputClass}
              placeholder="https://example.com/recipe"
            />
          </div>
          <div>
            <label htmlFor="imageUrl" className="mb-1 block text-sm font-medium">
              Image URL
              <span className="ml-1 text-muted-foreground">(optional)</span>
            </label>
            <input
              id="imageUrl"
              name="imageUrl"
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className={inputClass}
              placeholder="https://example.com/image.jpg"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { id: "servings", label: "Servings", value: servings, setter: setServings },
            { id: "prepTime", label: "Prep (min)", value: prepTime, setter: setPrepTime },
            { id: "cookTime", label: "Cook (min)", value: cookTime, setter: setCookTime },
            { id: "totalTime", label: "Total (min)", value: totalTime, setter: setTotalTime },
          ].map((field) => (
            <div key={field.id}>
              <label htmlFor={field.id} className="mb-1 block text-sm font-medium">
                {field.label}
              </label>
              <input
                id={field.id}
                type="number"
                min={0}
                inputMode="numeric"
                value={field.value}
                onChange={(e) => field.setter(e.target.value)}
                className={inputClass}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-xl text-primary-on-background">Ingredients</h2>
          <button
            type="button"
            onClick={addIngredient}
            className="text-xs font-semibold text-primary-on-card hover:underline"
          >
            + Add ingredient
          </button>
        </div>
        <ul className="space-y-2">
          {ingredients.map((row, idx) => (
            <li
              key={idx}
              className="grid grid-cols-[70px_96px_1fr_auto] items-center gap-2 rounded-lg border border-border bg-card p-2"
            >
              <input
                type="text"
                value={row.quantityText}
                onChange={(e) => setIngredient(idx, { quantityText: e.target.value })}
                placeholder="Qty"
                aria-label="Quantity"
                className="rounded-input border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <select
                value={row.unit}
                onChange={(e) =>
                  setIngredient(idx, {
                    unit: (e.target.value || "") as IngredientUnit | "",
                  })
                }
                aria-label="Unit"
                className="rounded-input border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Unit</option>
                {INGREDIENT_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u.toLowerCase()}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={row.displayText}
                onChange={(e) => setIngredient(idx, { displayText: e.target.value })}
                placeholder="Ingredient (e.g. all-purpose flour)"
                aria-label="Ingredient name"
                className="rounded-input border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => removeIngredient(idx)}
                aria-label="Remove ingredient"
                className="flex h-8 w-8 items-center justify-center rounded-input text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5"
                  aria-hidden="true"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-xl text-primary-on-background">Instructions</h2>
          <button
            type="button"
            onClick={addInstruction}
            className="text-xs font-semibold text-primary-on-card hover:underline"
          >
            + Add step
          </button>
        </div>
        <ol className="space-y-2">
          {instructions.map((text, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {idx + 1}
              </span>
              <textarea
                value={text}
                onChange={(e) => setInstruction(idx, e.target.value)}
                rows={2}
                placeholder={`Step ${idx + 1}`}
                className="min-h-[2.5rem] flex-1 rounded-input border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                type="button"
                onClick={() => removeInstruction(idx)}
                aria-label="Remove step"
                className="mt-1 flex h-8 w-8 items-center justify-center rounded-input text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5"
                  aria-hidden="true"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ol>
        {fieldErrors.instructions?.[0] && (
          <p className="text-xs text-destructive">{fieldErrors.instructions[0]}</p>
        )}
      </section>

      {allTags.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-display text-xl text-primary-on-background">Tags</h2>
          <div className="flex flex-wrap gap-2">
            {allTags.map((t) => {
              const selected = tagIds.has(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTag(t.id)}
                  aria-pressed={selected}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                    selected
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-accent"
                  )}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <label htmlFor="notes" className="block text-sm font-medium">
          Notes
          <span className="ml-1 text-muted-foreground">(markdown supported)</span>
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={5}
          placeholder="Anything else worth remembering — substitutions, timing, serving ideas…"
          className={cn(inputClass, "min-h-[7rem]")}
        />
      </section>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <a
          href={mode === "edit" && initial.id ? `/recipes/${initial.id}` : "/recipes"}
          className="btn-secondary inline-flex items-center px-4 py-2 text-sm font-semibold"
        >
          Cancel
        </a>
        <button
          type="submit"
          disabled={pending}
          className="btn-primary inline-flex items-center px-5 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {pending
            ? mode === "create"
              ? "Creating…"
              : "Saving…"
            : mode === "create"
              ? "Create recipe"
              : "Save changes"}
        </button>
      </div>
    </form>
  );
}
