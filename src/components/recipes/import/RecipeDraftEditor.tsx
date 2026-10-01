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
  const [ingredients, setIngredients] = useState<string[]>(
    draft.ingredients.length > 0 ? draft.ingredients : [""],
  );
  const [instructions, setInstructions] = useState<string[]>(
    draft.instructions.length > 0 ? draft.instructions : [""],
  );
  const [tagIds, setTagIds] = useState<Set<string>>(new Set());
  const [savingDestination, setSavingDestination] = useState<
    "detail" | "map" | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const saving = savingDestination !== null;

  function handleIngredientChange(idx: number, value: string) {
    setIngredients((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  }

  function removeIngredient(idx: number) {
    setIngredients((prev) => prev.filter((_, i) => i !== idx));
  }

  function addIngredient() {
    setIngredients((prev) => [...prev, ""]);
  }

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

    const filteredIngredients = ingredients
      .map((s) => s.trim())
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
      <div>
        <label className="mb-2 block text-sm font-medium">Ingredients</label>

        <div className="space-y-2">
          {ingredients.map((line, idx) => (
            <div key={idx} className="flex gap-2">
              <Input
                value={line}
                onChange={(e) => handleIngredientChange(idx, e.target.value)}
                placeholder={`Ingredient ${idx + 1}`}
                className="min-w-0 flex-1"
              />
              {ingredients.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeIngredient(idx)}
                  className="min-h-11 min-w-11 cursor-pointer rounded-input px-3 py-2 text-xs text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
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
          ))}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={addIngredient}
          className="mt-2"
        >
          Add ingredient
        </Button>
      </div>

      {/* Instructions */}
      <div>
        <label className="mb-2 block text-sm font-medium">Instructions</label>
        <div className="space-y-2">
          {instructions.map((step, idx) => (
            <div key={idx} className="flex gap-2">
              <span className="mt-2.5 text-xs text-muted-foreground">
                {idx + 1}.
              </span>
              <Textarea
                value={step}
                onChange={(e) => updateInstruction(idx, e.target.value)}
                placeholder={`Step ${idx + 1}`}
                rows={2}
                className="flex-1"
              />
              {instructions.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeInstruction(idx)}
                  className="min-h-11 min-w-11 cursor-pointer self-start rounded-input px-3 py-2 text-xs text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
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
          ))}
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
      </div>

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
