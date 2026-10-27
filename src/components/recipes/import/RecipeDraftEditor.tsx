/**
 * Editable draft editor for imported recipes. Shows parsed data and lets the
 * user review/modify before saving or continuing to ingredient mapping.
 */

import { useEffect, useRef, useState } from "react";
import { actions } from "astro:actions";

import type { IngredientUnit } from "@/db/schema/enums";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { TagToggle } from "@/components/ui/TagToggle";
import { INGREDIENT_UNITS, UNIT_LABELS } from "@/lib/ingredients/units";
import { parseScalableIngredientLine } from "@/lib/ingredients/parse-ingredient-line-structured";
import { formatQuantityForInput, parseQuantityText } from "@/lib/quantity/quantity";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/Tooltip";
import { softNavigate } from "@/lib/navigate";

export type RecipeDraft = {
  title: string;
  sourceUrl: string;
  imageUrl: string;
  servings?: number;
  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  totalTimeMinutes?: number;
  ingredients: string[];
  instructions: string[];
  notes: string;
};

interface Props {
  draft: RecipeDraft;
  onBack: () => void;
  allTags: { id: string; name: string }[];
}

type IngredientReviewStatus = "parsed" | "unquantified" | "needs-review" | "empty";

type IngredientReviewRow = {
  id: string;
  rawText: string | null;
  displayText: string;
  quantityText: string;
  unit: IngredientUnit | "";
  status: IngredientReviewStatus;
  edited: boolean;
};

function resizeInstructionTextarea(textarea: HTMLTextAreaElement) {
  const style = window.getComputedStyle(textarea);
  const lineHeight = Number.parseFloat(style.lineHeight) || 20;
  const verticalPadding =
    (Number.parseFloat(style.paddingTop) || 0) +
    (Number.parseFloat(style.paddingBottom) || 0);
  const verticalBorder =
    (Number.parseFloat(style.borderTopWidth) || 0) +
    (Number.parseFloat(style.borderBottomWidth) || 0);
  const minHeight = lineHeight * 2 + verticalPadding + verticalBorder;

  textarea.style.height = "auto";
  const contentHeight = textarea.scrollHeight + verticalBorder;
  textarea.style.height = `${Math.max(contentHeight, minHeight)}px`;
  textarea.style.overflowY = "hidden";
}

function createIngredientReviewRow(rawText: string, id: string): IngredientReviewRow {
  if (!rawText.trim()) {
    return { id, rawText: null, displayText: "", quantityText: "", unit: "", status: "empty", edited: false };
  }

  const parsed = parseScalableIngredientLine(rawText);
  if (parsed.kind === "scalable") {
    return {
      id,
      rawText,
      displayText: parsed.displayText,
      quantityText: formatQuantityForInput(parsed.quantity),
      unit: parsed.unit,
      status: "parsed",
      edited: false,
    };
  }

  return {
    id,
    rawText,
    displayText: parsed.displayText,
    quantityText: "",
    unit: "",
    status: parsed.kind,
    edited: false,
  };
}

export function RecipeDraftEditor({ draft, onBack, allTags }: Props) {
  const [title, setTitle] = useState(draft.title);
  const [sourceUrl, setSourceUrl] = useState(draft.sourceUrl);
  const [imageUrl, setImageUrl] = useState(draft.imageUrl);
  const [servings, setServings] = useState(
    draft.servings?.toString() ?? "",
  );
  const [prepTime, setPrepTime] = useState(
    draft.prepTimeMinutes?.toString() ?? "",
  );
  const [cookTime, setCookTime] = useState(
    draft.cookTimeMinutes?.toString() ?? "",
  );
  const [totalTime, setTotalTime] = useState(
    draft.totalTimeMinutes?.toString() ?? "",
  );
  const [notes, setNotes] = useState(draft.notes);
  const [ingredients, setIngredients] = useState<IngredientReviewRow[]>(() => {
    const lines = draft.ingredients.filter((line) => line.trim() !== "");
    return lines.length > 0
      ? lines.map((line, index) => createIngredientReviewRow(line, `ingredient-${index}`))
      : [createIngredientReviewRow("", "ingredient-0")];
  });
  const nextIngredientId = useRef(ingredients.length);
  const [instructions, setInstructions] = useState<string[]>(
    draft.instructions.length > 0 ? draft.instructions : [""],
  );
  const instructionsSectionRef = useRef<HTMLElement | null>(null);
  const [tagIds, setTagIds] = useState<Set<string>>(new Set());
  const [savingDestination, setSavingDestination] = useState<
    "detail" | "map" | null
  >(null);
  const [invalidFieldId, setInvalidFieldId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saving = savingDestination !== null;

  useEffect(() => {
    instructionsSectionRef.current
      ?.querySelectorAll("textarea")
      .forEach(resizeInstructionTextarea);
  }, [instructions]);

  function updateIngredient(id: string, patch: Partial<IngredientReviewRow>) {
    setError(null);
    setInvalidFieldId(null);
    setIngredients((prev) => {
      return prev.map((row) => row.id === id ? { ...row, ...patch, edited: true } : row);
    });
  }

  function removeIngredient(id: string) {
    setError(null);
    setInvalidFieldId(null);
    setIngredients((prev) => prev.filter((row) => row.id !== id));
  }

  function addIngredient() {
    setError(null);
    setInvalidFieldId(null);
    const id = `ingredient-${nextIngredientId.current++}`;
    setIngredients((prev) => [...prev, createIngredientReviewRow("", id)]);
  }

  function parseIntOr(val: string): number | undefined {
    const n = parseInt(val.trim(), 10);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  }

  async function handleSave(destination: "detail" | "map") {
    if (saving) return;

    setError(null);
    setInvalidFieldId(null);

    const recipePayload = {
      title: title.trim(),
      sourceUrl: sourceUrl.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined,
      servings: parseIntOr(servings),
      prepTimeMinutes: parseIntOr(prepTime),
      cookTimeMinutes: parseIntOr(cookTime),
      totalTimeMinutes: parseIntOr(totalTime),
      instructions: instructions
        .map((s) => s.trim())
        .filter(Boolean),
      notes: notes.trim() || undefined,
      tagIds: Array.from(tagIds),
    };

    if (!recipePayload.title) {
      setError("Title is required.");
      return;
    }
    if (recipePayload.instructions.length === 0) {
      setError("At least one instruction is required.");
      return;
    }

    const cleanIngredients: {
      rawText: string | null;
      displayText: string;
      quantity: number | null;
      unit: IngredientUnit | null;
    }[] = [];
    for (const row of ingredients) {
      const quantityText = row.quantityText.trim();
      if (!row.rawText?.trim() && !row.displayText.trim() && !quantityText && !row.unit) {
        continue;
      }

      const label = row.rawText?.trim() || row.displayText.trim() || "this ingredient";
      const displayText = row.displayText.trim();
      if (!displayText) {
        const fieldId = `draft-${row.id}-text`;
        setError(`Ingredient text is required for "${label}".`);
        setInvalidFieldId(fieldId);
        window.setTimeout(() => document.getElementById(fieldId)?.focus(), 0);
        return;
      }

      const quantity = quantityText === "" ? null : parseQuantityText(quantityText);
      if (quantityText !== "" && (quantity === null || !Number.isFinite(quantity))) {
        const fieldId = `draft-${row.id}-quantity`;
        setError(`Quantity for "${label}" must be a valid number or fraction that is 0 or greater.`);
        setInvalidFieldId(fieldId);
        window.setTimeout(() => document.getElementById(fieldId)?.focus(), 0);
        return;
      }

      cleanIngredients.push({
        rawText: row.rawText,
        displayText,
        quantity,
        unit: row.unit || null,
      });
    }

    if (cleanIngredients.length === 0) {
      setError("At least one ingredient is required.");
      return;
    }

    setSavingDestination(destination);
    let savedRecipeId: string | null = null;
    try {
      const { data, error: saveError } = await actions.recipeImport.saveTextOnly({
        recipe: recipePayload,
        ingredients: cleanIngredients,
      });

      if (saveError) {
        setError(saveError.message || "Failed to save recipe.");
        return;
      }

      savedRecipeId = data.recipeId;
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? `Failed to save recipe: ${cause.message}`
          : "Failed to save recipe. Please try again.",
      );
    } finally {
      if (savedRecipeId === null) setSavingDestination(null);
    }

    if (savedRecipeId === null) return;

    const recipePath = `/recipes/${savedRecipeId}`;
    softNavigate(
      destination === "map" ? `${recipePath}/map-ingredients` : recipePath,
    );
  }

  function updateInstruction(idx: number, value: string) {
    setInstructions((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  }

  function removeInstruction(idx: number) {
    setInstructions((prev) => prev.filter((_, i) => i !== idx));
  }

  function addInstruction() {
    setInstructions((prev) => [...prev, ""]);
  }

  function toggleTag(id: string) {
    setTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {error && (
        <div
          id="recipe-import-error"
          role="alert"
          className="rounded-input bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300"
        >
          {error}
        </div>
      )}

      {/* Metadata */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="draft-title" className="mb-1 block text-sm font-medium">Title</label>
          <Input id="draft-title" autoComplete="off" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label htmlFor="draft-source-url" className="mb-1 block text-sm font-medium">Source URL</label>
          <Input
            id="draft-source-url"
            type="url"
            autoComplete="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="draft-image-url" className="mb-1 block text-sm font-medium">Image URL</label>
          <Input
            id="draft-image-url"
            type="url"
            autoComplete="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="draft-servings" className="mb-1 block text-sm font-medium">Servings</label>
          <Input
            id="draft-servings"
            type="number"
            inputMode="numeric"
            autoComplete="off"
            value={servings}
            onChange={(e) => setServings(e.target.value)}
            min="0"
          />
        </div>
        <div>
          <label htmlFor="draft-prep-time" className="mb-1 block text-sm font-medium">
            Prep time (min)
          </label>
          <Input
            id="draft-prep-time"
            type="number"
            inputMode="numeric"
            autoComplete="off"
            value={prepTime}
            onChange={(e) => setPrepTime(e.target.value)}
            min="0"
          />
        </div>
        <div>
          <label htmlFor="draft-cook-time" className="mb-1 block text-sm font-medium">
            Cook time (min)
          </label>
          <Input
            id="draft-cook-time"
            type="number"
            inputMode="numeric"
            autoComplete="off"
            value={cookTime}
            onChange={(e) => setCookTime(e.target.value)}
            min="0"
          />
        </div>
        <div>
          <label htmlFor="draft-total-time" className="mb-1 block text-sm font-medium">
            Total time (min)
          </label>
          <Input
            id="draft-total-time"
            type="number"
            inputMode="numeric"
            autoComplete="off"
            value={totalTime}
            onChange={(e) => setTotalTime(e.target.value)}
            min="0"
          />
        </div>
      </div>

      {/* Ingredients */}
      <section aria-labelledby="draft-ingredients-heading" className="space-y-3">
        <div>
          <h2 id="draft-ingredients-heading" className="text-lg font-semibold">
            Ingredients
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Review how each line was split into an amount, unit, and ingredient before saving.
          </p>
        </div>

        <div className="space-y-3">
          {ingredients.map((row, idx) => {
            const textId = `draft-${row.id}-text`;
            const quantityId = `draft-${row.id}-quantity`;
            const unitId = `draft-${row.id}-unit`;
            const statusId = `draft-${row.id}-status`;
            const statusMessage = row.status === "parsed"
              ? row.edited
                ? "Your edits will be saved as entered."
                : null
              : row.status === "unquantified"
                ? row.edited
                  ? "No quantity was found automatically. Your edits will be saved as entered."
                  : "No quantity was detected automatically. This line will be saved without an amount."
                : row.status === "needs-review"
                  ? "Couldn't automatically parse ingredient."
                  : null;

            return (
              <article
                key={row.id}
                className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Original line
                    </p>
                    <p className="mt-1 break-words font-medium italic text-foreground">
                      {row.rawText?.trim() || row.displayText || "New ingredient"}
                    </p>
                  </div>
                  {ingredients.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeIngredient(row.id)}
                      disabled={saving}
                      className="min-h-11 min-w-11 shrink-0 cursor-pointer rounded-input px-3 py-2 text-xs text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-red-900/20"
                      title="Remove ingredient"
                      aria-label={`Remove ingredient ${idx + 1}`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4"
                        aria-hidden="true"
                      >
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 md:grid-cols-[minmax(0,1fr)_8rem_9rem]">
                  <div className="col-span-2 min-w-0 md:col-span-1">
                    <label htmlFor={textId} className="mb-1 block text-sm font-medium">
                      Ingredient text
                    </label>
                    <Input
                      id={textId}
                      className="min-h-11"
                      value={row.displayText}
                      placeholder="Ingredient name"
                      aria-label={`Ingredient text for ingredient ${idx + 1}`}
                      aria-invalid={invalidFieldId === textId}
                      aria-describedby={invalidFieldId === textId ? "recipe-import-error" : statusMessage ? statusId : undefined}
                      disabled={saving}
                      onChange={(event) => updateIngredient(row.id, { displayText: event.target.value })}
                    />
                  </div>
                  <div>
                    <label htmlFor={quantityId} className="mb-1 block text-sm font-medium">
                      Quantity
                    </label>
                    <Input
                      id={quantityId}
                      className="min-h-11"
                      type="text"
                      inputMode="decimal"
                      value={row.quantityText}
                      placeholder="Optional"
                      aria-label={`Quantity for ingredient ${idx + 1}`}
                      aria-invalid={invalidFieldId === quantityId}
                      aria-describedby={invalidFieldId === quantityId ? "recipe-import-error" : statusMessage ? statusId : undefined}
                      disabled={saving}
                      onChange={(event) => updateIngredient(row.id, { quantityText: event.target.value })}
                    />
                  </div>
                  <div>
                    <label htmlFor={unitId} className="mb-1 block text-sm font-medium">
                      Unit
                    </label>
                    <select
                      id={unitId}
                      value={row.unit}
                      aria-label={`Unit for ingredient ${idx + 1}`}
                      aria-invalid={invalidFieldId === unitId}
                      aria-describedby={invalidFieldId === unitId ? "recipe-import-error" : statusMessage ? statusId : undefined}
                      disabled={saving}
                      className="flex min-h-11 w-full rounded-input border border-input bg-card px-3 py-1.5 font-ui text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
                      onChange={(event) => updateIngredient(row.id, { unit: event.target.value as IngredientUnit | "" })}
                    >
                      <option value="">No unit</option>
                      {INGREDIENT_UNITS.map((unit) => (
                        <option key={unit} value={unit}>
                          {UNIT_LABELS[unit]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {statusMessage && (
                  <p
                    id={statusId}
                    role={row.status === "needs-review" ? "status" : undefined}
                    className={row.status === "needs-review"
                      ? "rounded-input border border-warning/30 bg-warning/10 p-3 text-sm leading-relaxed text-foreground"
                      : "text-xs leading-relaxed text-muted-foreground"}
                  >
                    {statusMessage}
                  </p>
                )}
              </article>
            );
          })}
        </div>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={addIngredient}
          disabled={saving}
          className="mt-2"
        >
          Add ingredient
        </Button>
      </section>

      {/* Instructions */}
      <section
        ref={instructionsSectionRef}
        aria-labelledby="draft-instructions-heading"
        className="space-y-3"
      >
        <h2 id="draft-instructions-heading" className="text-lg font-semibold">
          Instructions
        </h2>
        <div className="space-y-3">
          {instructions.map((step, idx) => {
            const stepId = `draft-instruction-${idx}`;

            return (
              <article
                key={idx}
                className="space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <label htmlFor={stepId} className="text-sm font-medium">
                    Step {idx + 1}
                  </label>
                  {instructions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeInstruction(idx)}
                      className="min-h-11 min-w-11 shrink-0 cursor-pointer rounded-input px-3 py-2 text-xs text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                      title="Remove step"
                      aria-label={`Remove step ${idx + 1}`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4"
                        aria-hidden="true"
                      >
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                <Textarea
                  id={stepId}
                  value={step}
                  onChange={(e) => {
                    updateInstruction(idx, e.target.value);
                    resizeInstructionTextarea(e.currentTarget);
                  }}
                  rows={2}
                  className="resize-none overflow-y-hidden leading-5"
                />
              </article>
            );
          })}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={addInstruction}
          className="mt-2"
        >
          Add step
        </Button>
      </section>

      {/* Notes */}
      <div>
        <label className="mb-1 block text-sm font-medium">Notes</label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </div>

      {/* Tags */}
      {allTags.length > 0 && (
        <div>
          <label className="mb-2 block text-sm font-medium">Tags</label>
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
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row">
        <Button
          onClick={() => handleSave("detail")}
          disabled={saving}
          className="w-full sm:w-auto"
        >
          {savingDestination === "detail" ? "Saving..." : "Save recipe"}
        </Button>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                onClick={() => handleSave("map")}
                disabled={saving}
                className="w-full sm:w-auto"
              >
                {savingDestination === "map" ? "Saving..." : "Save and map"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Save the recipe, then review and map its ingredients to items in
              your pantry.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <Button variant="secondary" onClick={onBack} disabled={saving} className="w-full sm:w-auto">
          Cancel
        </Button>
      </div>
    </div>
  );
}
