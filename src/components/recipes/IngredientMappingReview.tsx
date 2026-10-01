import { useEffect, useId, useRef, useState } from "react";
import { actions } from "astro:actions";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { IngredientUnit } from "@/db/schema/enums";
import type { IngredientMappingItemInput } from "@/features/recipes/ingredient-mapping.schemas";
import type { RecipeIngredientMappingPreviewItem } from "@/actions/ingredient-mapping";
import { INGREDIENT_UNITS, UNIT_LABELS } from "@/lib/ingredients/units";
import { softNavigate } from "@/lib/navigate";
import { parseQuantityText } from "@/lib/quantity/quantity";

type PickerResult = {
  id: string;
  name: string;
  source: "global" | "custom";
};

type MappingKind = "existing" | "create" | "unmapped";
type MatchType =
  | "current"
  | "exact"
  | "alias"
  | "fuzzy"
  | "llm"
  | "selected";

type ReviewRow = {
  recipeIngredientId: string;
  recipeIngredientUpdatedAt: number;
  rawText: string;
  displayText: string;
  quantityText: string;
  unit: IngredientUnit | "";
  mappingKind: MappingKind;
  ingredientId: string;
  ingredientName: string;
  matchType: MatchType | null;
  createName: string;
  createSuggested: boolean;
};

interface Props {
  recipeId: string;
  recipeTitle: string;
}

function initializeRow(item: RecipeIngredientMappingPreviewItem): ReviewRow {
  let mappingKind: MappingKind = "unmapped";
  let ingredientId = "";
  let ingredientName = "";
  let matchType: MatchType | null = null;
  let createName = item.suggestedCreateName ?? "";
  let createSuggested = false;

  if (item.currentIngredient) {
    mappingKind = "existing";
    ingredientId = item.currentIngredient.id;
    ingredientName = item.currentIngredient.name;
    matchType = "current";
  } else if (item.suggestedIngredient) {
    mappingKind = "existing";
    ingredientId = item.suggestedIngredient.id;
    ingredientName = item.suggestedIngredient.name;
    matchType = item.suggestedIngredient.matchType;
  } else if (item.suggestedCreateName) {
    mappingKind = "create";
    createName = item.suggestedCreateName;
    createSuggested = true;
  }

  return {
    recipeIngredientId: item.recipeIngredientId,
    recipeIngredientUpdatedAt: item.recipeIngredientUpdatedAt,
    rawText: item.rawText,
    displayText: item.displayText,
    quantityText: item.quantity == null ? "" : String(item.quantity),
    unit: item.unit ?? "",
    mappingKind,
    ingredientId,
    ingredientName,
    matchType,
    createName,
    createSuggested,
  };
}

function matchLabel(matchType: MatchType | null): string | null {
  switch (matchType) {
    case "current":
      return "Current mapping";
    case "exact":
      return "Exact suggestion";
    case "alias":
      return "Alias suggestion";
    case "fuzzy":
      return "Fuzzy suggestion";
    case "llm":
      return "AI suggestion";
    case "selected":
      return "Selected";
    default:
      return null;
  }
}

function CatalogPicker({
  rowId,
  selectedId,
  selectedName,
  invalid,
  validationErrorId,
  disabled,
  onSelect,
}: {
  rowId: string;
  selectedId: string;
  selectedName: string;
  invalid: boolean;
  validationErrorId: string;
  disabled: boolean;
  onSelect: (ingredient: PickerResult) => void;
}) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickerResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [completedQuery, setCompletedQuery] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  function closeSearch() {
    setQuery("");
    setResults([]);
    setSearching(false);
    setSearchError(null);
    setCompletedQuery(null);
    setHighlightedIndex(-1);
  }

  useEffect(() => {
    function handleOutsidePointer(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) closeSearch();
    }

    document.addEventListener("mousedown", handleOutsidePointer);
    return () => document.removeEventListener("mousedown", handleOutsidePointer);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      setCompletedQuery(null);
      setHighlightedIndex(-1);
      return;
    }

    setResults([]);
    setSearchError(null);
    setCompletedQuery(null);
    setHighlightedIndex(-1);

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const { data, error } = await actions.ingredients.searchForPicker({
          query: trimmed,
        });
        if (cancelled) return;
        if (error) {
          setResults([]);
          setSearchError(error.message || "Ingredient search failed.");
          return;
        }
        setResults(data ?? []);
        setCompletedQuery(trimmed);
        setHighlightedIndex(-1);
      } catch (cause) {
        if (cancelled) return;
        setResults([]);
        setSearchError(
          cause instanceof Error && cause.message
            ? `Ingredient search failed: ${cause.message}`
            : "Ingredient search failed.",
        );
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  function selectResult(result: PickerResult) {
    onSelect(result);
    closeSearch();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && results.length > 0) {
      event.preventDefault();
      setHighlightedIndex((current) =>
        Math.min(current + 1, results.length - 1),
      );
    } else if (event.key === "ArrowUp" && results.length > 0) {
      event.preventDefault();
      setHighlightedIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && highlightedIndex >= 0) {
      const result = results[highlightedIndex];
      if (result) {
        event.preventDefault();
        selectResult(result);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeSearch();
    }
  }

  const activeOption =
    highlightedIndex >= 0
      ? `${listboxId}-option-${results[highlightedIndex]?.id}`
      : undefined;
  const statusMessage = searching
    ? "Searching..."
    : searchError
      ? searchError
      : completedQuery === query.trim() && results.length === 0
        ? "No ingredients found."
        : null;

  useEffect(() => {
    if (!activeOption) return;
    document
      .getElementById(activeOption)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [activeOption]);

  return (
    <div
      ref={containerRef}
      className="space-y-3"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          closeSearch();
        }
      }}
    >
      <div>
        <label
          htmlFor={`${rowId}-selected-ingredient`}
          className="mb-1 block text-xs font-medium text-muted-foreground"
        >
          Selected ingredient
        </label>
        <Input
          id={`${rowId}-selected-ingredient`}
          value={selectedName}
          placeholder="No ingredient selected"
          readOnly
          disabled={disabled}
        />
      </div>
      <div className="relative">
        <label
          htmlFor={`${rowId}-ingredient-search`}
          className="mb-1 block text-xs font-medium text-muted-foreground"
        >
          Search ingredient catalog
        </label>
        <Input
          id={`${rowId}-ingredient-search`}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={results.length > 0}
          aria-controls={results.length > 0 ? listboxId : undefined}
          aria-activedescendant={activeOption}
          aria-invalid={invalid}
          aria-describedby={
            invalid
              ? validationErrorId
              : statusMessage
                ? `${listboxId}-status`
                : undefined
          }
          autoComplete="off"
          value={query}
          placeholder="Type at least 2 characters"
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        {results.length > 0 && (
          <div
            id={listboxId}
            role="listbox"
            aria-label="Ingredient search results"
            className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-input border border-border bg-card p-1 shadow-lg"
          >
            {results.map((result, index) => (
              <button
                id={`${listboxId}-option-${result.id}`}
                key={result.id}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={result.id === selectedId}
                className={`flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-input px-3 py-2 text-left text-sm ${
                  index === highlightedIndex
                    ? "bg-primary/10 text-foreground"
                    : "hover:bg-accent"
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectResult(result)}
              >
                <span>{result.name}</span>
                <span className="text-xs text-muted-foreground">
                  {result.source === "custom" ? "Yours" : "Global"}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {statusMessage && (
        <p
          id={`${listboxId}-status`}
          role="status"
          aria-live="polite"
          className={`text-sm ${searchError ? "text-destructive" : "text-muted-foreground"}`}
        >
          {statusMessage}
        </p>
      )}
    </div>
  );
}

function MappingBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary-on-card">
      {children}
    </span>
  );
}

function ReviewRowCard({
  row,
  disabled,
  invalidFieldId,
  validationErrorId,
  onChange,
}: {
  row: ReviewRow;
  disabled: boolean;
  invalidFieldId: string | null;
  validationErrorId: string;
  onChange: (patch: Partial<ReviewRow>) => void;
}) {
  const headingId = `${row.recipeIngredientId}-heading`;
  const label = matchLabel(row.matchType);

  return (
    <article
      aria-labelledby={headingId}
      className="space-y-5 rounded-xl border border-border bg-card p-4 sm:p-5"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Original line
          </p>
          <h2 id={headingId} className="mt-1 break-words font-medium text-foreground">
            {row.rawText}
          </h2>
        </div>
        {row.mappingKind === "existing" && label && (
          <MappingBadge>{label}</MappingBadge>
        )}
        {row.mappingKind === "create" && row.createSuggested && (
          <MappingBadge>Create suggestion</MappingBadge>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_8rem_9rem]">
        <div>
          <label
            htmlFor={`${row.recipeIngredientId}-display-text`}
            className="mb-1 block text-sm font-medium"
          >
            Display text
          </label>
          <Input
            id={`${row.recipeIngredientId}-display-text`}
            value={row.displayText}
            aria-invalid={
              invalidFieldId === `${row.recipeIngredientId}-display-text`
            }
            aria-describedby={
              invalidFieldId === `${row.recipeIngredientId}-display-text`
                ? validationErrorId
                : undefined
            }
            disabled={disabled}
            onChange={(event) => onChange({ displayText: event.target.value })}
          />
        </div>
        <div>
          <label
            htmlFor={`${row.recipeIngredientId}-quantity`}
            className="mb-1 block text-sm font-medium"
          >
            Quantity
          </label>
          <Input
            id={`${row.recipeIngredientId}-quantity`}
            type="text"
            inputMode="decimal"
            value={row.quantityText}
            aria-invalid={
              invalidFieldId === `${row.recipeIngredientId}-quantity`
            }
            aria-describedby={
              invalidFieldId === `${row.recipeIngredientId}-quantity`
                ? validationErrorId
                : undefined
            }
            disabled={disabled}
            placeholder="Optional"
            onChange={(event) => onChange({ quantityText: event.target.value })}
          />
        </div>
        <div>
          <label
            htmlFor={`${row.recipeIngredientId}-unit`}
            className="mb-1 block text-sm font-medium"
          >
            Unit
          </label>
          <select
            id={`${row.recipeIngredientId}-unit`}
            value={row.unit}
            disabled={disabled}
            className="flex h-10 w-full rounded-input border border-input bg-card px-3 py-1.5 font-ui text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
            onChange={(event) =>
              onChange({ unit: event.target.value as IngredientUnit | "" })
            }
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

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">Mapping</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              ["existing", "Existing catalog ingredient"],
              ["create", "Create ingredient"],
              ["unmapped", "Leave unmapped"],
            ] as const
          ).map(([kind, text]) => (
            <label
              key={kind}
              className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-input border px-3 py-2 text-sm transition-colors ${
                row.mappingKind === kind
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border hover:bg-accent"
              }`}
            >
              <input
                type="radio"
                name={`${row.recipeIngredientId}-mapping`}
                value={kind}
                checked={row.mappingKind === kind}
                disabled={disabled}
                onChange={() => onChange({ mappingKind: kind })}
              />
              {text}
            </label>
          ))}
        </div>

        {row.mappingKind === "existing" && (
          <CatalogPicker
            rowId={row.recipeIngredientId}
            selectedId={row.ingredientId}
            selectedName={row.ingredientName}
            invalid={
              invalidFieldId ===
              `${row.recipeIngredientId}-ingredient-search`
            }
            validationErrorId={validationErrorId}
            disabled={disabled}
            onSelect={(ingredient) =>
              onChange({
                ingredientId: ingredient.id,
                ingredientName: ingredient.name,
                matchType: "selected",
              })
            }
          />
        )}

        {row.mappingKind === "create" && (
          <div>
            <label
              htmlFor={`${row.recipeIngredientId}-create-name`}
              className="mb-1 block text-sm font-medium"
            >
              New ingredient name
            </label>
            <Input
              id={`${row.recipeIngredientId}-create-name`}
              value={row.createName}
              aria-invalid={
                invalidFieldId === `${row.recipeIngredientId}-create-name`
              }
              aria-describedby={
                invalidFieldId === `${row.recipeIngredientId}-create-name`
                  ? validationErrorId
                  : undefined
              }
              disabled={disabled}
              onChange={(event) =>
                onChange({
                  createName: event.target.value,
                  createSuggested: false,
                })
              }
            />
          </div>
        )}

        {row.mappingKind === "unmapped" && (
          <p className="text-sm text-muted-foreground">
            This line will keep its structured text but will not link to a
            catalog ingredient.
          </p>
        )}
      </fieldset>
    </article>
  );
}

function buildApplyItems(rows: ReviewRow[]):
  | {
      items: IngredientMappingItemInput[];
      error: null;
      invalidFieldId: null;
    }
  | { items: null; error: string; invalidFieldId: string } {
  const items: IngredientMappingItemInput[] = [];

  for (const row of rows) {
    const displayText = row.displayText.trim();
    if (!displayText) {
      return {
        items: null,
        error: `Display text is required for "${row.rawText}".`,
        invalidFieldId: `${row.recipeIngredientId}-display-text`,
      };
    }

    const quantityText = row.quantityText.trim();
    const quantity = quantityText === "" ? null : parseQuantityText(quantityText);
    if (quantityText !== "" && quantity === null) {
      return {
        items: null,
        error: `Quantity for "${row.rawText}" must be a valid number or fraction that is 0 or greater.`,
        invalidFieldId: `${row.recipeIngredientId}-quantity`,
      };
    }

    let mapping: IngredientMappingItemInput["mapping"];
    if (row.mappingKind === "existing") {
      if (!row.ingredientId) {
        return {
          items: null,
          error: `Choose an existing ingredient for "${row.rawText}".`,
          invalidFieldId: `${row.recipeIngredientId}-ingredient-search`,
        };
      }
      mapping = { kind: "existing", ingredientId: row.ingredientId };
    } else if (row.mappingKind === "create") {
      const name = row.createName.trim();
      if (!name) {
        return {
          items: null,
          error: `New ingredient name is required for "${row.rawText}".`,
          invalidFieldId: `${row.recipeIngredientId}-create-name`,
        };
      }
      mapping = { kind: "create", name };
    } else {
      mapping = { kind: "unmapped" };
    }

    items.push({
      recipeIngredientId: row.recipeIngredientId,
      recipeIngredientUpdatedAt: row.recipeIngredientUpdatedAt,
      displayText,
      quantity,
      unit: row.unit || null,
      mapping,
    });
  }

  return { items, error: null, invalidFieldId: null };
}

export function IngredientMappingReview({ recipeId, recipeTitle }: Props) {
  const validationErrorId = useId();
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [automaticMappingWarning, setAutomaticMappingWarning] = useState<
    string | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [invalidFieldId, setInvalidFieldId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const applyingRef = useRef(false);
  const activeRecipeIdRef = useRef(recipeId);
  activeRecipeIdRef.current = recipeId;

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setPreviewError(null);
    setAutomaticMappingWarning(null);
    setActionError(null);
    setInvalidFieldId(null);
    setApplying(false);
    applyingRef.current = false;

    async function loadPreview() {
      try {
        const { data, error } = await actions.ingredientMapping.previewRecipe({
          recipeId,
        });
        if (cancelled) return;
        if (error) {
          setPreviewError(error.message || "Failed to load ingredient mappings.");
          return;
        }
        setAutomaticMappingWarning(data?.automaticMappingWarning ?? null);
        setRows((data?.items ?? []).map(initializeRow));
      } catch (cause) {
        if (cancelled) return;
        setPreviewError(
          cause instanceof Error && cause.message
            ? `Failed to load ingredient mappings: ${cause.message}`
            : "Failed to load ingredient mappings.",
        );
      }
    }

    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [recipeId]);

  function updateRow(recipeIngredientId: string, patch: Partial<ReviewRow>) {
    setActionError(null);
    setInvalidFieldId(null);
    setRows((current) =>
      current?.map((row) =>
        row.recipeIngredientId === recipeIngredientId
          ? { ...row, ...patch }
          : row,
      ) ?? null,
    );
  }

  async function handleApply() {
    if (!rows || applyingRef.current) return;

    setActionError(null);
    setInvalidFieldId(null);
    const payload = buildApplyItems(rows);
    if (payload.items === null) {
      setActionError(payload.error);
      setInvalidFieldId(payload.invalidFieldId);
      window.setTimeout(() => {
        document.getElementById(payload.invalidFieldId)?.focus();
      }, 0);
      return;
    }

    applyingRef.current = true;
    setApplying(true);
    const submittedRecipeId = recipeId;
    let applied = false;
    try {
      const { error } = await actions.ingredientMapping.applyRecipe({
        recipeId,
        items: payload.items,
      });
      if (activeRecipeIdRef.current !== submittedRecipeId) return;
      if (error) {
        setActionError(error.message || "Failed to apply ingredient mappings.");
        return;
      }
      applied = true;
    } catch (cause) {
      if (activeRecipeIdRef.current !== submittedRecipeId) return;
      setActionError(
        cause instanceof Error && cause.message
          ? `Failed to apply ingredient mappings: ${cause.message}`
          : "Failed to apply ingredient mappings.",
      );
    } finally {
      if (!applied && activeRecipeIdRef.current === submittedRecipeId) {
        applyingRef.current = false;
        setApplying(false);
      }
    }

    if (applied && activeRecipeIdRef.current === submittedRecipeId) {
      softNavigate(`/recipes/${recipeId}`);
    }
  }

  if (previewError) {
    return (
      <div
        role="alert"
        className="rounded-input bg-destructive/10 p-4 text-sm text-destructive"
      >
        {previewError}
      </div>
    );
  }

  if (rows === null) {
    return (
      <div
        role="status"
        className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground"
      >
        Loading ingredient mappings for {recipeTitle}...
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="space-y-4 rounded-xl border border-dashed border-border bg-card/50 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          This recipe has no ingredients to map.
        </p>
        <Button
          href={`/recipes/${recipeId}`}
          variant="secondary"
          className="min-h-11"
        >
          Back to recipe
        </Button>
      </div>
    );
  }

  return (
    <section aria-label={`Ingredient mappings for ${recipeTitle}`} className="space-y-5">
      {automaticMappingWarning && (
        <div
          role="status"
          className="rounded-input border border-warning/30 bg-warning/10 p-4 text-sm text-foreground"
        >
          {automaticMappingWarning}
        </div>
      )}
      <div className="space-y-4">
        {rows.map((row) => (
          <ReviewRowCard
            key={row.recipeIngredientId}
            row={row}
            disabled={applying}
            invalidFieldId={invalidFieldId}
            validationErrorId={validationErrorId}
            onChange={(patch) => updateRow(row.recipeIngredientId, patch)}
          />
        ))}
      </div>

      <div className="space-y-3 border-t border-border pt-5">
        {actionError && (
          <div
            id={validationErrorId}
            role="alert"
            className="rounded-input bg-destructive/10 p-4 text-sm text-destructive"
          >
            {actionError}
          </div>
        )}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            disabled={applying}
            className="min-h-11 w-full sm:w-auto"
            onClick={handleApply}
          >
            {applying ? "Applying..." : "Apply mappings"}
          </Button>
          {applying ? (
            <Button
              type="button"
              variant="secondary"
              disabled
              className="min-h-11 w-full sm:w-auto"
            >
              Cancel
            </Button>
          ) : (
            <Button
              href={`/recipes/${recipeId}`}
              variant="secondary"
              className="min-h-11 w-full sm:w-auto"
            >
              Cancel
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
