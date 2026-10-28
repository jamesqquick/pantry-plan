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
import type { SaveImportedRecipeTextOnlyInput } from "@/features/import/import.schemas";
import { requiredIngredientMeasurementsSchema } from "@/features/recipes/ingredient-measurements";
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
import { SortableRecipeList } from "../SortableRecipeList";
import { useRecipeEditorRows } from "../useRecipeEditorRows";

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

function createIngredientReviewRow(rawText: string): IngredientReviewRow {
  if (!rawText.trim()) {
    return { rawText: null, displayText: "", quantityText: "", unit: "", status: "empty", edited: false };
  }

  const parsed = parseScalableIngredientLine(rawText);
  if (parsed.kind === "scalable") {
    return {
      rawText,
      displayText: parsed.displayText,
      quantityText: formatQuantityForInput(parsed.quantity),
      unit: parsed.unit,
      status: "parsed",
      edited: false,
    };
  }

  return {
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
  const initialIngredients = draft.ingredients
    .filter((line) => line.trim() !== "")
    .map((line) => createIngredientReviewRow(line));
  const ingredients = useRecipeEditorRows(
    initialIngredients,
    () => createIngredientReviewRow(""),
  );
  const instructionsSectionRef = useRef<HTMLElement | null>(null);
  const instructions = useRecipeEditorRows(draft.instructions, () => "");
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
  }, [instructions.rows]);

  function updateIngredient(id: string, patch: Partial<IngredientReviewRow>) {
    setError(null);
    setInvalidFieldId(null);
    ingredients.update(id, (row) => ({ ...row, ...patch, edited: true }));
  }
  function addIngredient() {
    setError(null);
    setInvalidFieldId(null);
    return ingredients.add();
  }
  function removeIngredient(id: string) {
    setError(null);
    setInvalidFieldId(null);
    ingredients.remove(id);
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
      instructions: instructions.rows
        .map((row) => row.value.trim())
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

    const cleanIngredients: SaveImportedRecipeTextOnlyInput["ingredients"] = [];
    for (const { id, value: row } of ingredients.rows) {
      const quantityText = row.quantityText.trim();
      if (!row.rawText?.trim() && !row.displayText.trim() && !quantityText && !row.unit) {
        continue;
      }

      const label = row.rawText?.trim() || row.displayText.trim() || "this ingredient";
      const displayText = row.displayText.trim();
      if (!displayText) {
        const fieldId = id;
        setError(`Ingredient text is required for "${label}".`);
        setInvalidFieldId(fieldId);
        window.setTimeout(() => document.getElementById(fieldId)?.focus(), 0);
        return;
      }

      const measurements = requiredIngredientMeasurementsSchema.safeParse({
        quantity: parseQuantityText(quantityText),
        unit: row.unit,
      });
      if (!measurements.success) {
        const invalidQuantity = measurements.error.issues.some((issue) => issue.path[0] === "quantity");
        const fieldId = `${id}-${invalidQuantity ? "quantity" : "unit"}`;
        setError(invalidQuantity
          ? quantityText === ""
            ? `Quantity is required for "${label}".`
            : `Quantity for "${label}" must be a valid number or fraction that is 0 or greater.`
          : `Choose a unit for "${label}".`);
        setInvalidFieldId(fieldId);
        window.setTimeout(() => document.getElementById(fieldId)?.focus(), 0);
        return;
      }

      cleanIngredients.push({
        rawText: row.rawText,
        displayText,
        ...measurements.data,
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
          className="rounded-input bg-red-50 p-3 text-body text-red-700 dark:bg-red-900/20 dark:text-red-300"
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
          <p className="mt-1 text-body text-muted-foreground">
            Review how each line was split into an amount, unit, and ingredient before saving.
          </p>
        </div>

        <SortableRecipeList
          kind="ingredient"
          rows={ingredients.rows}
          disabled={saving}
          onAdd={addIngredient}
          onMove={ingredients.move}
          onRemove={removeIngredient}
          getText={(row) => row.rawText?.trim() || row.displayText || "New ingredient"}
        >
          {({ id, value: row }, idx) => {
            const textId = id;
            const quantityId = `${id}-quantity`;
            const unitId = `${id}-unit`;
            const statusId = `${id}-status`;
            const hasIngredientContent = Boolean(
              row.rawText?.trim() || row.displayText.trim() || row.quantityText.trim() || row.unit,
            );
            const measurements = requiredIngredientMeasurementsSchema.safeParse({
              quantity: parseQuantityText(row.quantityText),
              unit: row.unit,
            });
            const measurementIssues = hasIngredientContent && !measurements.success
              ? measurements.error.issues
              : [];
            const quantityInvalid = invalidFieldId === quantityId ||
              measurementIssues.some((issue) => issue.path[0] === "quantity");
            const unitInvalid = invalidFieldId === unitId ||
              measurementIssues.some((issue) => issue.path[0] === "unit");
            const statusMessage = row.status === "unquantified" && !measurements.success
              ? "No quantity was detected automatically. Enter a quantity and choose a unit before saving."
              : row.status === "needs-review"
                ? "Couldn't automatically parse ingredient."
                : row.edited && measurements.success
                  ? "Your edits will be saved as entered."
                  : null;

            return (
              <div className="space-y-4">
                <div>
                  <p className="text-meta font-medium uppercase tracking-wide text-muted-foreground">
                    Original line
                  </p>
                  <p className="mt-1 break-words font-medium italic text-foreground">
                    {row.rawText?.trim() || row.displayText || "New ingredient"}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 md:grid-cols-[8rem_9rem_minmax(0,1fr)]">
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
                      placeholder="e.g. 1/2"
                      required
                      aria-required="true"
                      aria-label={`Quantity for ingredient ${idx + 1}`}
                      aria-invalid={quantityInvalid}
                      aria-describedby={invalidFieldId === quantityId ? "recipe-import-error" : statusMessage ? statusId : undefined}
                      disabled={saving}
                      onChange={(event) => updateIngredient(id, { quantityText: event.target.value })}
                    />
                  </div>
                  <div>
                    <label htmlFor={unitId} className="mb-1 block text-sm font-medium">
                      Unit
                    </label>
                    <select
                      id={unitId}
                      value={row.unit}
                      required
                      aria-required="true"
                      aria-label={`Unit for ingredient ${idx + 1}`}
                      aria-invalid={unitInvalid}
                      aria-describedby={invalidFieldId === unitId ? "recipe-import-error" : statusMessage ? statusId : undefined}
                      disabled={saving}
                      className="flex min-h-11 w-full rounded-input border border-input bg-card px-3 py-1.5 font-ui text-body transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 aria-invalid:border-destructive aria-invalid:ring-destructive/30 disabled:cursor-not-allowed disabled:opacity-50"
                      onChange={(event) => updateIngredient(id, { unit: event.target.value as IngredientUnit | "" })}
                    >
                      <option value="">Select unit</option>
                      {INGREDIENT_UNITS.map((unit) => (
                        <option key={unit} value={unit}>
                          {UNIT_LABELS[unit]}
                        </option>
                      ))}
                    </select>
                  </div>
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
                      onChange={(event) => updateIngredient(id, { displayText: event.target.value })}
                    />
                  </div>
                </div>

                {statusMessage && (
                  <p
                    id={statusId}
                    role={row.status === "needs-review" ? "status" : undefined}
                    className={row.status === "needs-review"
                      ? "rounded-input border border-warning/30 bg-warning/10 p-3 text-body leading-relaxed text-foreground"
                      : "text-meta leading-relaxed text-muted-foreground"}
                  >
                    {statusMessage}
                  </p>
                )}
              </div>
            );
          }}
        </SortableRecipeList>
      </section>

      {/* Instructions */}
      <section
        ref={instructionsSectionRef}
        aria-labelledby="draft-instructions-heading"
        className="space-y-3"
      >
        <h2 id="draft-instructions-heading" className="text-lg font-semibold">Instructions</h2>
        <SortableRecipeList
          kind="step"
          rows={instructions.rows}
          disabled={saving}
          onAdd={instructions.add}
          onMove={instructions.move}
          onRemove={instructions.remove}
          getText={(text) => text}
        >
          {({ id, value }, idx) => (
            <>
              <label htmlFor={id} className="sr-only">Step {idx + 1}</label>
              <Textarea
                id={id}
                value={value}
                onChange={(e) => {
                  instructions.update(id, e.target.value);
                  resizeInstructionTextarea(e.currentTarget);
                }}
                placeholder={`Describe step ${idx + 1}`}
                rows={2}
                className="resize-none overflow-y-hidden leading-5"
              />
            </>
          )}
        </SortableRecipeList>
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
