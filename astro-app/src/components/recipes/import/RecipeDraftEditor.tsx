/**
 * Editable draft editor for imported recipes. Shows parsed data and lets the
 * user review/modify before saving.
 *
 * On mount (or when ingredients change), runs enhance.ingredientLines to get
 * mapping suggestions. Save uses saveWithMappings when mappings are available,
 * falling back to saveTextOnly otherwise.
 */

import { useState, useEffect, useCallback } from "react";
import { actions } from "astro:actions";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { TagToggle } from "@/components/ui/TagToggle";
import type { IngredientUnit } from "@/db/schema/enums";

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

type MappingItem = {
  rawText: string;
  displayText: string;
  quantity: number | null;
  unit: string | null;
  ingredientId: string;
  ingredientName: string;
  createName: string;
  sortOrder: number;
  matchType?: "exact" | "alias" | "fuzzy" | "llm";
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ingredient mapping state
  const [mappings, setMappings] = useState<MappingItem[] | null>(null);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [mappingStale, setMappingStale] = useState(false);

  // Run mapping on mount with the initial ingredient lines
  const runMapping = useCallback(async (lines: string[]) => {
    const filtered = lines.map((s) => s.trim()).filter(Boolean);
    if (filtered.length === 0) {
      setMappings(null);
      return;
    }
    setMappingLoading(true);
    setMappingError(null);
    setMappingStale(false);

    const { data, error: mapErr } = await actions.enhance.ingredientLines({
      lines: filtered,
    });

    setMappingLoading(false);

    if (mapErr) {
      setMappingError("Could not auto-map ingredients. You can still save as text.");
      setMappings(null);
      return;
    }

    setMappings(data.items);
  }, []);

  // Initial mapping pass on mount
  useEffect(() => {
    const filtered = draft.ingredients.filter((s) => s.trim());
    if (filtered.length > 0) {
      runMapping(filtered);
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mark mappings stale when ingredients are edited
  function handleIngredientChange(idx: number, value: string) {
    setIngredients((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
    if (mappings) setMappingStale(true);
  }

  function removeIngredient(idx: number) {
    setIngredients((prev) => prev.filter((_, i) => i !== idx));
    if (mappings) setMappingStale(true);
  }

  function addIngredient() {
    setIngredients((prev) => [...prev, ""]);
    if (mappings) setMappingStale(true);
  }

  function parseIntOr(val: string): number | undefined {
    const n = parseInt(val.trim(), 10);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  }

  async function handleSave() {
    setSaving(true);
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
      setSaving(false);
      return;
    }
    if (recipePayload.instructions.length === 0) {
      setError("At least one instruction is required.");
      setSaving(false);
      return;
    }

    const filteredIngredients = ingredients
      .map((s) => s.trim())
      .filter(Boolean);
    if (filteredIngredients.length === 0) {
      setError("At least one ingredient is required.");
      setSaving(false);
      return;
    }

    // Use saveWithMappings if we have fresh, non-stale mappings
    const hasMappings = mappings && !mappingStale && mappings.length > 0;

    if (hasMappings) {
      const ingredientLines = mappings.map((m, i) => ({
        originalLine: m.rawText,
        displayText: m.displayText,
        ingredientId: m.ingredientId || undefined,
        createName: m.createName || undefined,
        quantity: m.quantity ?? undefined,
        unit: (m.unit as IngredientUnit) ?? undefined,
        sortOrder: i,
      }));

      const { data, error: saveError } =
        await actions.recipeImport.saveWithMappings({
          recipe: recipePayload,
          ingredientLines,
        });

      setSaving(false);

      if (saveError) {
        setError(saveError.message || "Failed to save recipe.");
        return;
      }

      window.location.href = `/recipes/${data.recipeId}`;
    } else {
      // Fallback: save as text-only
      const { data, error: saveError } =
        await actions.recipeImport.saveTextOnly({
          recipe: recipePayload,
          ingredients: filteredIngredients,
        });

      setSaving(false);

      if (saveError) {
        setError(saveError.message || "Failed to save recipe.");
        return;
      }

      window.location.href = `/recipes/${data.recipeId}`;
    }
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

  /** Get mapping status for an ingredient line. */
  function getMappingBadge(idx: number): {
    label: string;
    className: string;
  } | null {
    if (!mappings || mappingStale) return null;
    const m = mappings[idx];
    if (!m) return null;
    if (m.ingredientId) {
      const typeLabel = m.matchType === "exact"
        ? "Exact"
        : m.matchType === "alias"
          ? "Alias"
          : m.matchType === "fuzzy"
            ? "Fuzzy"
            : m.matchType === "llm"
              ? "AI"
              : "Matched";
      return {
        label: `${typeLabel}: ${m.ingredientName}`,
        className:
          "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300",
      };
    }
    if (m.createName) {
      return {
        label: `New: ${m.createName}`,
        className:
          "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300",
      };
    }
    return {
      label: "Unmapped",
      className:
        "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
    };
  }

  const mappedCount = mappings?.filter((m) => m.ingredientId || m.createName).length ?? 0;
  const totalMappings = mappings?.length ?? 0;

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-input bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Metadata */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium">Title</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Source URL</label>
          <Input
            type="url"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Image URL</label>
          <Input
            type="url"
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Servings</label>
          <Input
            type="number"
            value={servings}
            onChange={(e) => setServings(e.target.value)}
            min="0"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">
            Prep time (min)
          </label>
          <Input
            type="number"
            value={prepTime}
            onChange={(e) => setPrepTime(e.target.value)}
            min="0"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">
            Cook time (min)
          </label>
          <Input
            type="number"
            value={cookTime}
            onChange={(e) => setCookTime(e.target.value)}
            min="0"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">
            Total time (min)
          </label>
          <Input
            type="number"
            value={totalTime}
            onChange={(e) => setTotalTime(e.target.value)}
            min="0"
          />
        </div>
      </div>

      {/* Ingredients */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="block text-sm font-medium">Ingredients</label>
          <div className="flex items-center gap-2">
            {mappingLoading && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <svg
                  className="h-3 w-3 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Mapping...
              </span>
            )}
            {mappings && !mappingStale && !mappingLoading && (
              <span className="text-xs text-muted-foreground">
                {mappedCount}/{totalMappings} mapped
              </span>
            )}
            {mappingStale && !mappingLoading && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => runMapping(ingredients)}
              >
                Re-map ingredients
              </Button>
            )}
          </div>
        </div>

        {mappingError && (
          <div className="mb-2 rounded-input bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            {mappingError}
          </div>
        )}

        <div className="space-y-2">
          {ingredients.map((line, idx) => {
            const badge = getMappingBadge(idx);
            return (
              <div key={idx} className="space-y-0.5">
                <div className="flex gap-2">
                  <Input
                    value={line}
                    onChange={(e) =>
                      handleIngredientChange(idx, e.target.value)
                    }
                    placeholder={`Ingredient ${idx + 1}`}
                    className="flex-1"
                  />
                  {ingredients.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeIngredient(idx)}
                      className="cursor-pointer rounded-input px-2 py-1 text-xs text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                      title="Remove ingredient"
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
                {badge && (
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-[10px] leading-tight font-medium ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                )}
              </div>
            );
          })}
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
                  className="cursor-pointer self-start rounded-input px-2 py-1 text-xs text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                  title="Remove step"
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
      <div className="flex gap-3 border-t border-border pt-4">
        <Button onClick={handleSave} disabled={saving || mappingLoading}>
          {saving
            ? "Saving..."
            : mappings && !mappingStale
              ? "Save with mappings"
              : "Save recipe"}
        </Button>
        <Button variant="secondary" onClick={onBack} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
