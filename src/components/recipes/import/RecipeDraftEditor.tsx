/**
 * Editable draft editor for imported recipes. Shows parsed data and lets the
 * user review/modify before saving or continuing to ingredient mapping.
 */

import { useState } from "react";
import { actions } from "astro:actions";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { TagToggle } from "@/components/ui/TagToggle";
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
  const ingredients = useRecipeEditorRows(draft.ingredients, () => "");
  const instructions = useRecipeEditorRows(draft.instructions, () => "");
  const [tagIds, setTagIds] = useState<Set<string>>(new Set());
  const [savingDestination, setSavingDestination] = useState<
    "detail" | "map" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const saving = savingDestination !== null;

  function parseIntOr(val: string): number | undefined {
    const n = parseInt(val.trim(), 10);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  }

  async function handleSave(destination: "detail" | "map") {
    if (saving) return;

    setError(null);

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

    const filteredIngredients = ingredients.rows
      .map((row) => row.value.trim())
      .filter(Boolean);
    if (filteredIngredients.length === 0) {
      setError("At least one ingredient is required.");
      return;
    }

    setSavingDestination(destination);
    let savedRecipeId: string | null = null;
    try {
      const { data, error: saveError } = await actions.recipeImport.saveTextOnly({
        recipe: recipePayload,
        ingredients: filteredIngredients,
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
      <section className="space-y-3">
        <h2 className="font-display text-xl text-foreground">Ingredients</h2>
        <SortableRecipeList
          kind="ingredient"
          rows={ingredients.rows}
          disabled={saving}
          onAdd={ingredients.add}
          onMove={ingredients.move}
          onRemove={ingredients.remove}
          getText={(text) => text}
        >
          {({ id, value }, idx) => (
            <>
              <label htmlFor={id} className="sr-only">Ingredient {idx + 1}</label>
              <Input
                id={id}
                value={value}
                onChange={(e) => ingredients.update(id, e.target.value)}
                placeholder="e.g. 2 cups all-purpose flour"
                className="h-11 text-base sm:text-sm"
              />
            </>
          )}
        </SortableRecipeList>
      </section>

      {/* Instructions */}
      <section className="space-y-3">
        <h2 className="font-display text-xl text-foreground">Instructions</h2>
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
                onChange={(e) => instructions.update(id, e.target.value)}
                placeholder={`Describe step ${idx + 1}`}
                rows={3}
                className="min-h-24 resize-y text-base [field-sizing:content] sm:text-sm"
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
