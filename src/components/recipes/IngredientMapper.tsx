/**
 * Inline ingredient mapper: shows current mapping status and lets the user
 * search the ingredient catalog to change/set/clear the mapping.
 *
 * Uses ingredients.searchForPicker action (debounced) for typeahead search.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { actions } from "astro:actions";
import { Input } from "@/components/ui/Input";

type PickerResult = {
  id: string;
  name: string;
  source: "global" | "custom";
};

interface Props {
  /** Currently mapped ingredient ID (empty string = unmapped). */
  ingredientId: string | null;
  /** Currently mapped ingredient name. */
  ingredientName: string | null | undefined;
  /** Called when the user selects a mapping. */
  onMap: (ingredientId: string, ingredientName: string) => void;
  /** Called when the user clears the mapping. */
  onClear: () => void;
}

export function IngredientMapper({
  ingredientId,
  ingredientName,
  onMap,
  onClear,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const isMapped = !!ingredientId;

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await actions.ingredients.searchForPicker({
      query: trimmed,
    });
    setLoading(false);
    if (!error && data) {
      setResults(data);
      setHighlightIdx(-1);
    }
  }, []);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 250);
  }

  function handleSelect(item: PickerResult) {
    onMap(item.id, item.name);
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  function handleClear() {
    onClear();
    setOpen(false);
    setQuery("");
    setResults([]);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && highlightIdx >= 0 && results[highlightIdx]) {
      e.preventDefault();
      handleSelect(results[highlightIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function toggleOpen() {
    setOpen((prev) => {
      if (!prev) {
        // Focus the search input when opening
        setTimeout(() => inputRef.current?.focus(), 0);
      }
      return !prev;
    });
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      {/* Trigger: shows current mapping status */}
      <button
        type="button"
        onClick={toggleOpen}
        className={`inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-[10px] leading-tight font-medium ring-1 ring-transparent transition-all hover:shadow-sm ${
          isMapped
            ? "bg-green-50 text-green-700 hover:bg-green-100 hover:ring-green-200 dark:bg-green-900/20 dark:text-green-300 dark:hover:bg-green-900/30 dark:hover:ring-green-700/40"
            : "bg-amber-50 text-amber-700 hover:bg-amber-100 hover:ring-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/30 dark:hover:ring-amber-700/40"
        }`}
      >
        {isMapped ? (
          <>
            {ingredientName || ingredientId}
            {/* Pencil icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-2.5 w-2.5"
              aria-hidden="true"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </>
        ) : (
          <>
            Unmapped — click to map
            {/* Search icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-2.5 w-2.5"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 z-50 mt-1 w-64 rounded-lg border border-border bg-card shadow-lg">
          <div className="p-2">
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search ingredients..."
              className="h-8 text-xs"
              autoComplete="off"
            />
          </div>

          <div className="max-h-48 overflow-y-auto">
            {loading && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                Searching...
              </p>
            )}

            {!loading && query.trim().length >= 2 && results.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                No matches found
              </p>
            )}

            {results.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item)}
                className={`flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                  idx === highlightIdx
                    ? "bg-primary/10 text-foreground"
                    : "text-foreground hover:bg-muted"
                } ${item.id === ingredientId ? "font-semibold" : ""}`}
              >
                <span className="truncate">{item.name}</span>
                <span className="shrink-0 text-[9px] text-muted-foreground">
                  {item.source === "custom" ? "yours" : "global"}
                </span>
              </button>
            ))}
          </div>

          {/* Footer actions */}
          <div className="flex items-center gap-1 border-t border-border px-2 py-1.5">
            {isMapped && (
              <button
                type="button"
                onClick={handleClear}
                className="cursor-pointer rounded px-2 py-1 text-[10px] font-medium text-amber-700 transition-colors hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-900/20"
              >
                Clear mapping
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-auto cursor-pointer rounded px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
