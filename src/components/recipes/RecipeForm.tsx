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
import { SortableRecipeList } from "./SortableRecipeList";
import { useRecipeEditorRows } from "./useRecipeEditorRows";

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
  const instructions = useRecipeEditorRows(initial.instructions, () => "");
  const ingredients = useRecipeEditorRows(initial.ingredients, emptyIngredient);
  const [tagIds, setTagIds] = useState<Set<string>>(new Set(initial.tagIds));

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function setIngredient(id: string, patch: Partial<RecipeIngredientDraft>) {
    ingredients.update(id, (row) => ({ ...row, ...patch }));
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
    if (pending) return;
    setPending(true);
    setError(null);
    setFieldErrors({});

    // Build payload. Shape must match features/recipes/recipes.schemas.ts
    // extended with ingredientsStructured (see src/actions/recipes.ts).
    const cleanInstructions = instructions.rows
      .map((row) => row.value.trim())
      .filter(Boolean);
    const cleanIngredients = ingredients.rows
      .map((row) => row.value)
      .filter(
        (r) => r.displayText.trim() !== "" || r.quantityText.trim() !== "",
      )
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

    if (cleanInstructions.length === 0) {
      setError("At least one instruction is required.");
      setPending(false);
      return;
    }

    try {
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
    } catch {
      setError("Could not save recipe. Please try again.");
      setPending(false);
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
            autoComplete="off"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={!!fieldErrors.title}
          />
          {fieldErrors.title?.[0] && (
            <p className="mt-1 text-xs text-destructive">
              {fieldErrors.title[0]}
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="sourceUrl"
              className="mb-1 block text-sm font-medium"
            >
              Source URL
              <span className="ml-1 text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="sourceUrl"
              name="sourceUrl"
              type="url"
              autoComplete="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://example.com/recipe"
            />
          </div>
          <div>
            <label
              htmlFor="imageUrl"
              className="mb-1 block text-sm font-medium"
            >
              Image URL
              <span className="ml-1 text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="imageUrl"
              name="imageUrl"
              type="url"
              autoComplete="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/image.jpg"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          {[
            {
              id: "servings",
              label: "Servings",
              value: servings,
              setter: setServings,
            },
            {
              id: "prepTime",
              label: "Prep (min)",
              value: prepTime,
              setter: setPrepTime,
            },
            {
              id: "cookTime",
              label: "Cook (min)",
              value: cookTime,
              setter: setCookTime,
            },
            {
              id: "totalTime",
              label: "Total (min)",
              value: totalTime,
              setter: setTotalTime,
            },
          ].map((field) => (
            <div key={field.id}>
              <label
                htmlFor={field.id}
                className="mb-1 block text-sm font-medium"
              >
                {field.label}
              </label>
              <Input
                id={field.id}
                type="number"
                min={0}
                inputMode="numeric"
                autoComplete="off"
                value={field.value}
                onChange={(e) => field.setter(e.target.value)}
              />
            </div>
          ))}
        </div>
      </section>

      <section id="recipe-ingredients" className="scroll-mt-24 space-y-3">
        <h2 className="font-display text-xl text-foreground">Ingredients</h2>
        <SortableRecipeList
          kind="ingredient"
          rows={ingredients.rows}
          disabled={pending}
          onAdd={ingredients.add}
          onMove={ingredients.move}
          onRemove={ingredients.remove}
          getText={(row) =>
            [row.quantityText, row.unit.toLowerCase(), row.displayText]
              .filter(Boolean)
              .join(" ")
          }
        >
          {({ id, value: row }, idx) => (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-[5rem_5rem_minmax(0,1fr)]">
                <div className="min-w-0 space-y-1">
                  <label
                    htmlFor={`${id}-quantity`}
                    className="block text-xs font-medium text-muted-foreground"
                  >
                    Quantity
                  </label>
                  <Input
                    id={`${id}-quantity`}
                    value={row.quantityText}
                    onChange={(e) =>
                      setIngredient(id, { quantityText: e.target.value })
                    }
                    placeholder="e.g. 1/2"
                    aria-label={`Ingredient ${idx + 1} quantity`}
                    inputMode="decimal"
                    autoComplete="off"
                    className="h-11 text-base sm:text-sm"
                  />
                </div>
                <div className="min-w-0 space-y-1">
                  <label
                    htmlFor={`${id}-unit`}
                    className="block text-xs font-medium text-muted-foreground"
                  >
                    Unit
                  </label>
                  <Select
                    value={row.unit}
                    onValueChange={(value) =>
                      setIngredient(id, {
                        unit: (value || "") as IngredientUnit | "",
                      })
                    }
                  >
                    <SelectTrigger
                      id={`${id}-unit`}
                      aria-label={`Ingredient ${idx + 1} unit`}
                      className="h-11 text-base sm:text-sm"
                    >
                      <SelectValue placeholder="Unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {INGREDIENT_UNITS.map((unit) => (
                        <SelectItem key={unit} value={unit}>
                          {unit.toLowerCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 min-w-0 space-y-1 sm:col-span-1">
                  <label
                    htmlFor={id}
                    className="block text-xs font-medium text-muted-foreground"
                  >
                    Ingredient text
                  </label>
                  <Input
                    id={id}
                    value={row.displayText}
                    onChange={(e) =>
                      setIngredient(id, { displayText: e.target.value })
                    }
                    placeholder="e.g. all-purpose flour"
                    aria-label={`Ingredient ${idx + 1} name`}
                    className="h-11 text-base sm:text-sm"
                  />
                </div>
              </div>
              <div className="mt-3">
                <IngredientMapper
                  ingredientId={row.ingredientId}
                  ingredientName={row.ingredientName}
                  onMap={(ingredientId, name) =>
                    setIngredient(id, { ingredientId, ingredientName: name })
                  }
                  onClear={() =>
                    setIngredient(id, {
                      ingredientId: null,
                      ingredientName: null,
                    })
                  }
                />
              </div>
            </>
          )}
        </SortableRecipeList>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-xl text-foreground">Instructions</h2>
        <SortableRecipeList
          kind="step"
          rows={instructions.rows}
          disabled={pending}
          onAdd={instructions.add}
          onMove={instructions.move}
          onRemove={instructions.remove}
          getText={(text) => text}
        >
          {({ id, value }, idx) => (
            <>
              <label htmlFor={id} className="sr-only">
                Step {idx + 1}
              </label>
              <Textarea
                id={id}
                value={value}
                onChange={(e) => instructions.update(id, e.target.value)}
                rows={3}
                placeholder={`Describe step ${idx + 1}`}
                className="min-h-24 resize-y text-base [field-sizing:content] sm:text-sm"
              />
            </>
          )}
        </SortableRecipeList>
        {fieldErrors.instructions?.[0] && (
          <p className="text-xs text-destructive">
            {fieldErrors.instructions[0]}
          </p>
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
          <span className="ml-1 text-muted-foreground">
            (markdown supported)
          </span>
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
        <div
          role="alert"
          className="rounded-input border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
        <Button
          variant="secondary"
          href={
            mode === "edit" && initial.id
              ? `/recipes/${initial.id}`
              : "/recipes"
          }
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={pending}
          className="w-full px-5 sm:w-auto"
        >
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
