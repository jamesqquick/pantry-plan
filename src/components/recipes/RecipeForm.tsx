import { useState } from "react";
import { actions } from "astro:actions";
import { INGREDIENT_UNITS, type IngredientUnit } from "@/db/schema/enums";
import { parseQuantityText } from "@/lib/quantity/quantity";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { TagToggle } from "@/components/ui/TagToggle";
import { IngredientMapper } from "@/components/recipes/IngredientMapper";

export type RecipeFormMode = "create" | "edit";

export type RecipeIngredientDraft = {
  displayText: string;
  quantityText: string;
  unit: IngredientUnit | "";
  rawText: string | null;
  ingredientId: string | null;
  ingredientName?: string | null;
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

  return (
    <form onSubmit={handleSubmit} className="space-y-8" noValidate>
      <section className="space-y-4">
        <div>
          <label htmlFor="title" className="mb-1 block text-sm font-medium">
            Title
          </label>
          <Input
            id="title"
            name="title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
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
            <Input
              id="sourceUrl"
              name="sourceUrl"
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://example.com/recipe"
            />
          </div>
          <div>
            <label htmlFor="imageUrl" className="mb-1 block text-sm font-medium">
              Image URL
              <span className="ml-1 text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="imageUrl"
              name="imageUrl"
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
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
              <Input
                id={field.id}
                type="number"
                min={0}
                inputMode="numeric"
                value={field.value}
                onChange={(e) => field.setter(e.target.value)}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-xl text-foreground">Ingredients</h2>
          <button
            type="button"
            onClick={addIngredient}
            className="cursor-pointer rounded-input px-2 py-1 text-xs font-semibold text-primary-on-card transition-colors hover:bg-primary/10"
          >
            + Add ingredient
          </button>
        </div>
        <ul className="space-y-2">
          {ingredients.map((row, idx) => (
            <li
              key={idx}
              className="rounded-input border border-border bg-card p-2"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  value={row.quantityText}
                  onChange={(e) => setIngredient(idx, { quantityText: e.target.value })}
                  placeholder="Qty"
                  aria-label="Quantity"
                  className="sm:w-16 sm:shrink-0"
                />
                <Select
                  value={row.unit}
                  onValueChange={(value) =>
                    setIngredient(idx, {
                      unit: (value || "") as IngredientUnit | "",
                    })
                  }
                >
                  <SelectTrigger
                    aria-label="Unit"
                    className="sm:w-24 sm:shrink-0"
                  >
                    <SelectValue placeholder="Unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {INGREDIENT_UNITS.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u.toLowerCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={row.displayText}
                  onChange={(e) => setIngredient(idx, { displayText: e.target.value })}
                  placeholder="Ingredient (e.g. all-purpose flour)"
                  aria-label="Ingredient name"
                  className="min-w-0 sm:flex-1"
                />
                <button
                  type="button"
                  onClick={() => removeIngredient(idx)}
                  aria-label="Remove ingredient"
                  className="flex h-8 w-full cursor-pointer items-center justify-center gap-1 rounded-input text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:w-8 sm:shrink-0"
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
                  <span className="sm:hidden">Remove ingredient</span>
                </button>
              </div>
              <div className="mt-1">
                <IngredientMapper
                  ingredientId={row.ingredientId}
                  ingredientName={row.ingredientName}
                  onMap={(id, name) =>
                    setIngredient(idx, { ingredientId: id, ingredientName: name })
                  }
                  onClear={() =>
                    setIngredient(idx, { ingredientId: null, ingredientName: null })
                  }
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-xl text-foreground">Instructions</h2>
          <button
            type="button"
            onClick={addInstruction}
            className="cursor-pointer rounded-input px-2 py-1 text-xs font-semibold text-primary-on-card transition-colors hover:bg-primary/10"
          >
            + Add step
          </button>
        </div>
        <ol className="space-y-2">
          {instructions.map((text, idx) => (
            <li
              key={idx}
              className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-2"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground sm:mt-2">
                {idx + 1}
              </span>
              <Textarea
                value={text}
                onChange={(e) => setInstruction(idx, e.target.value)}
                rows={2}
                placeholder={`Step ${idx + 1}`}
                className="min-h-[2.5rem] min-w-0 sm:flex-1"
              />
              <button
                type="button"
                onClick={() => removeInstruction(idx)}
                aria-label="Remove step"
                className="flex h-8 w-full cursor-pointer items-center justify-center gap-1 rounded-input text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive sm:mt-1 sm:w-8 sm:shrink-0"
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
                <span className="sm:hidden">Remove step</span>
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
          <h2 className="font-display text-xl text-foreground">Tags</h2>
          <div className="flex flex-wrap gap-2">
            {allTags.map((t) => (
              <TagToggle
                key={t.id}
                selected={tagIds.has(t.id)}
                onClick={() => toggleTag(t.id)}
              >
                {t.name}
              </TagToggle>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <label htmlFor="notes" className="block text-sm font-medium">
          Notes
          <span className="ml-1 text-muted-foreground">(markdown supported)</span>
        </label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={5}
          placeholder="Anything else worth remembering — substitutions, timing, serving ideas…"
          className="min-h-[7rem]"
        />
      </section>

      {error && (
        <div className="rounded-input border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <Button
          variant="secondary"
          href={mode === "edit" && initial.id ? `/recipes/${initial.id}` : "/recipes"}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending} className="px-5">
        
          {pending
            ? mode === "create"
              ? "Creating…"
              : "Saving…"
            : mode === "create"
              ? "Create recipe"
              : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
