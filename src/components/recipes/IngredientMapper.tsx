import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { actions } from "astro:actions";
import { ChevronDown, Info, Search } from "lucide-react";
import { Input } from "@/components/ui/Input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/Tooltip";

type PickerResult = {
  id: string;
  name: string;
  source: "global" | "custom";
};

interface Props {
  ingredientId: string | null;
  ingredientName: string | null | undefined;
  createIngredientName: string | null | undefined;
  disabled?: boolean;
  onMap: (ingredientId: string, ingredientName: string) => void;
  onCreate: (ingredientName: string) => void;
  onClear: () => void;
}

const CATALOG_INGREDIENT_HELP =
  "Link this recipe line to a catalog item to combine matching shopping-list items, convert units, and estimate cost.";

export function IngredientMapper({
  ingredientId,
  ingredientName,
  createIngredientName,
  disabled = false,
  onMap,
  onCreate,
  onClear,
}: Props) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickerResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [completedQuery, setCompletedQuery] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const trimmedQuery = query.trim();
  const selectedName =
    ingredientName || createIngredientName || ingredientId || "";
  const isMapped = Boolean(ingredientId || createIngredientName);
  const searchComplete = completedQuery === trimmedQuery;
  const visibleResults = searchComplete ? results : [];
  const canCreate =
    searchComplete && trimmedQuery.length > 0 && results.length === 0 && !searchError;
  const optionCount = visibleResults.length + (canCreate ? 1 : 0);
  const activeOption =
    highlightedIndex >= 0 && highlightedIndex < optionCount
      ? `${listboxId}-option-${canCreate && highlightedIndex === results.length ? "create" : visibleResults[highlightedIndex]?.id}`
      : undefined;

  useEffect(() => {
    function handleOutsidePointer(event: MouseEvent) {
      if (containerRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setResults([]);
      setSearching(false);
      setSearchError(null);
      setCompletedQuery(null);
      setHighlightedIndex(-1);
    }

    document.addEventListener("mousedown", handleOutsidePointer);
    return () => document.removeEventListener("mousedown", handleOutsidePointer);
  }, []);

  useEffect(() => {
    if (disabled) setOpen(false);
    if (!open || disabled || trimmedQuery.length === 0) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      setCompletedQuery(null);
      setHighlightedIndex(-1);
      return;
    }

    let cancelled = false;
    setResults([]);
    setSearching(true);
    setSearchError(null);
    setCompletedQuery(null);
    setHighlightedIndex(-1);

    const timer = window.setTimeout(async () => {
      try {
        const { data, error } = await actions.ingredients.searchForPicker({
          query: trimmedQuery,
        });
        if (cancelled) return;
        if (error || !data) {
          setSearchError(error?.message || "Ingredient search failed.");
          return;
        }
        setResults(data);
        setCompletedQuery(trimmedQuery);
      } catch (cause) {
        if (cancelled) return;
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
  }, [disabled, open, trimmedQuery]);

  function closePicker(clearSearch = false) {
    setOpen(false);
    setResults([]);
    setSearching(false);
    setSearchError(null);
    setCompletedQuery(null);
    setHighlightedIndex(-1);
    if (clearSearch) setQuery("");
  }

  function togglePicker() {
    if (disabled) return;
    if (open) {
      closePicker();
      return;
    }
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function selectResult(item: PickerResult) {
    onMap(item.id, item.name);
    closePicker(true);
  }

  function selectCreate() {
    onCreate(trimmedQuery);
    closePicker(true);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (optionCount > 0) {
        setHighlightedIndex((current) =>
          event.key === "ArrowDown"
            ? Math.min(current + 1, optionCount - 1)
            : Math.max(current - 1, 0),
        );
      }
    } else if (event.key === "Enter" && optionCount > 0) {
      event.preventDefault();
      const index = Math.max(highlightedIndex, 0);
      if (canCreate && index === results.length) selectCreate();
      else if (visibleResults[index]) selectResult(visibleResults[index]!);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closePicker();
    }
  }

  return (
    <div ref={containerRef} className="relative w-full min-w-0 space-y-1.5">
      <div className="flex min-h-5 items-center gap-1.5">
        <span
          id={`${listboxId}-field-label`}
          className="text-meta font-medium text-muted-foreground"
        >
          Catalog ingredient
        </span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="About catalog ingredients"
                disabled={disabled}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Info size={15} aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{CATALOG_INGREDIENT_HELP}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={isMapped
          ? createIngredientName
            ? `${selectedName}, new catalog ingredient`
            : selectedName
          : "Choose an ingredient"}
        aria-describedby={`${listboxId}-field-label`}
        disabled={disabled}
        onClick={togglePicker}
        className="flex min-h-11 w-full min-w-0 items-center justify-between gap-3 rounded-input border border-input bg-card px-3 py-2 text-left text-sm text-foreground transition-colors hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span
          className={`min-w-0 flex-1 truncate ${isMapped ? "" : "text-muted-foreground"}`}
        >
          {isMapped ? selectedName : "Choose an ingredient"}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {createIngredientName && (
            <span className="inline-flex shrink-0 items-center rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
              New
            </span>
          )}
          <ChevronDown
            size={16}
            aria-hidden="true"
            className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      {open && !disabled && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 w-full max-w-full overflow-hidden rounded-input border border-border bg-card shadow-lg">
          <div className="relative p-2">
            <Search
              size={16}
              aria-hidden="true"
              className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              ref={inputRef}
              role="combobox"
              aria-label="Search catalog ingredients"
              aria-autocomplete="list"
              aria-expanded={searching || optionCount > 0}
              aria-controls={optionCount > 0 ? listboxId : undefined}
              aria-activedescendant={activeOption}
              autoComplete="off"
              maxLength={500}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search catalog ingredients"
              className="h-11 pl-10 pr-3"
            />
          </div>

          <div className="max-h-64 overflow-y-auto border-t border-border p-1">
            {searching && (
              <p role="status" className="px-3 py-2 text-meta text-muted-foreground">
                Searching catalog…
              </p>
            )}
            {searchError && (
              <p role="alert" className="px-3 py-2 text-meta text-destructive">
                {searchError}
              </p>
            )}
            {!searching && !searchError && trimmedQuery.length === 0 && (
              <p className="px-3 py-2 text-meta text-muted-foreground">
                Search your catalog by ingredient name.
              </p>
            )}
            {searchComplete && !searching && optionCount > 0 && (
              <div
                id={listboxId}
                role="listbox"
                aria-label="Catalog ingredient results"
                className="max-h-60 overflow-y-auto"
              >
                {visibleResults.map((item, index) => (
                  <button
                    id={`${listboxId}-option-${item.id}`}
                    key={item.id}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={item.id === ingredientId}
                    className={`flex min-h-11 w-full min-w-0 items-center justify-between gap-3 rounded-input px-3 py-2 text-left text-sm ${
                      index === highlightedIndex
                        ? "bg-primary/10 text-foreground"
                        : "text-foreground hover:bg-accent"
                    }`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectResult(item)}
                  >
                    <span className="min-w-0 flex-1 break-words">{item.name}</span>
                    <span className="shrink-0 text-meta text-muted-foreground">
                      {item.source === "custom" ? "Yours" : "Global"}
                    </span>
                  </button>
                ))}
                {canCreate && (
                  <button
                    id={`${listboxId}-option-create`}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={highlightedIndex === results.length}
                    className={`flex min-h-11 w-full min-w-0 items-center gap-2 rounded-input px-3 py-2 text-left text-sm font-medium text-primary-on-card ${
                      highlightedIndex === results.length
                        ? "bg-primary/10"
                        : "hover:bg-accent"
                    }`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={selectCreate}
                  >
                    <span className="min-w-0 flex-1 break-words">
                      Add “{trimmedQuery}” to catalog
                    </span>
                    <span className="inline-flex shrink-0 items-center rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                      New
                    </span>
                  </button>
                )}
              </div>
            )}
            {searchComplete && !searching && !searchError && optionCount === 0 && (
              <p className="px-3 py-2 text-meta text-muted-foreground">
                No matches found.
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-border px-2 py-2">
            {isMapped && (
              <button
                type="button"
                onClick={() => {
                  onClear();
                  closePicker(true);
                }}
                className="min-h-11 rounded-input px-3 py-2 text-meta font-medium text-primary-on-card hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Clear mapping
              </button>
            )}
            <button
              type="button"
              onClick={() => closePicker()}
              className="ml-auto min-h-11 rounded-input px-3 py-2 text-meta font-medium text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
