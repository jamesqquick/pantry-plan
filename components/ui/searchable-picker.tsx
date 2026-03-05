"use client";

import { useState, useRef, useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

const SEARCH_DEBOUNCE_MS = 300;

export type SearchablePickerProps<T> = {
  options: T[];
  getItemId: (item: T) => string;
  getItemLabel: (item: T) => string;
  onSelect: (item: T) => void;
  onSearch?: (query: string) => Promise<T[]>;
  onCreate?: (name: string) => Promise<T | null>;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
  inputClassName?: string;
  trailingIcon?: React.ReactNode;
  emptyMessage?: string;
  searchPlaceholder?: string;
  createButtonLabel?: (filter: string) => string;
  noResultsMessage?: string;
  renderOption?: (item: T, index: number) => React.ReactNode;
  filterWhenEmpty?: string;
  displayValue: string;
  onDisplayValueChange: (value: string) => void;
  listboxDataAttribute?: string;
  searchLoading?: boolean;
  onFocus?: () => void;
  containerClassName?: string;
};

export function SearchablePicker<T>({
  options,
  getItemId,
  getItemLabel,
  onSelect,
  onSearch,
  onCreate,
  placeholder = "Search or choose",
  disabled = false,
  label,
  inputClassName,
  trailingIcon,
  emptyMessage = "Type to search",
  searchPlaceholder,
  createButtonLabel = (filter) => `Create "${filter}"`,
  noResultsMessage = "No results found",
  renderOption,
  filterWhenEmpty,
  displayValue,
  onDisplayValueChange,
  listboxDataAttribute = "data-searchable-picker-list",
  searchLoading: searchLoadingProp,
  onFocus,
  containerClassName,
}: SearchablePickerProps<T>) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [searchResults, setSearchResults] = useState<T[]>([]);
  const [searchLoadingInternal, setSearchLoadingInternal] = useState(false);
  const searchLoading = searchLoadingProp ?? (onSearch ? searchLoadingInternal : false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [dropdownRect, setDropdownRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQueryRef = useRef("");
  const listId = useId();
  const inputId = useId();

  const resolvedOptions = onSearch ? searchResults : options;
  const showCreate =
    filterWhenEmpty !== undefined
      ? filterWhenEmpty.trim() && onCreate
      : displayValue.trim() && onCreate;
  const optionCount = resolvedOptions.length + (showCreate ? 1 : 0);

  useEffect(() => {
    if (!onSearch) return;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const trimmed = displayValue.trim();
    if (trimmed === "") {
      setSearchResults([]);
      setSearchLoadingInternal(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      lastQueryRef.current = trimmed;
      setSearchLoadingInternal(true);
      onSearch(trimmed)
        .then((data) => {
          if (lastQueryRef.current === trimmed) {
            setSearchResults(Array.isArray(data) ? data : []);
          }
        })
        .catch(() => {
          if (lastQueryRef.current === trimmed) setSearchResults([]);
        })
        .finally(() => {
          if (lastQueryRef.current === trimmed) setSearchLoadingInternal(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [displayValue, onSearch]);

  useEffect(() => {
    if (!open) {
      setHighlightedIndex(-1);
      return;
    }
    if (!displayValue.trim() || optionCount === 0) {
      setHighlightedIndex(-1);
      return;
    }
    setHighlightedIndex(0);
  }, [open, displayValue, optionCount]);

  useEffect(() => {
    if (highlightedIndex < 0) return;
    itemRefs.current[highlightedIndex]?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  useEffect(() => {
    if (!open || !inputRef.current) {
      setDropdownRect(null);
      return;
    }
    const el = inputRef.current;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setDropdownRect({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, displayValue]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        const target = e.target as HTMLElement;
        if (target.closest(`[${listboxDataAttribute}]`)) return;
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [listboxDataAttribute]);

  async function selectOption(index: number) {
    if (index < 0 || index >= optionCount) return;
    if (showCreate && index === resolvedOptions.length) {
      if (!onCreate || creating) return;
      const name = (filterWhenEmpty ?? displayValue).trim();
      setCreating(true);
      try {
        const item = await onCreate(name);
        if (item) {
          onSelect(item);
        }
        onDisplayValueChange("");
        setOpen(false);
      } finally {
        setCreating(false);
      }
      return;
    }
    const item = resolvedOptions[index];
    if (item) {
      onSelect(item);
      onDisplayValueChange("");
      setOpen(false);
    }
  }

  const dropdownContent =
    open && typeof document !== "undefined" ? (
      <div
        {...{ [listboxDataAttribute]: true }}
        id={listId}
        role="listbox"
        className="fixed z-[9999] rounded-input border border-border bg-popover shadow-lg text-popover-foreground"
        style={
          dropdownRect
            ? {
                top: dropdownRect.top,
                left: dropdownRect.left,
                width: dropdownRect.width,
                maxHeight: 192,
              }
            : { visibility: "hidden" as const }
        }
      >
        <div className="max-h-48 overflow-auto py-1">
          {(onSearch || searchLoadingProp !== undefined) && !displayValue.trim() && (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              {searchPlaceholder ?? emptyMessage}
            </p>
          )}
          {(onSearch || searchLoadingProp !== undefined) && searchLoading && (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              Searching…
            </p>
          )}
          {!searchLoading &&
            resolvedOptions.map((item, index) => (
              <button
                key={getItemId(item)}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                type="button"
                role="option"
                aria-selected={index === highlightedIndex}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground",
                  renderOption && "justify-between",
                  index === highlightedIndex
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-muted"
                )}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlightedIndex(index)}
                onClick={() => selectOption(index)}
              >
                {renderOption
                  ? renderOption(item, index)
                  : getItemLabel(item)}
              </button>
            ))}
          {showCreate && (
            <button
              ref={(el) => {
                itemRefs.current[resolvedOptions.length] = el;
              }}
              type="button"
              role="option"
              aria-selected={resolvedOptions.length === highlightedIndex}
              disabled={creating}
              className={cn(
                "w-full border-t border-border px-3 py-2 text-left text-sm text-foreground",
                resolvedOptions.length === highlightedIndex
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted"
              )}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlightedIndex(resolvedOptions.length)}
              onClick={() => selectOption(resolvedOptions.length)}
            >
              {creating
                ? "Creating…"
                : createButtonLabel(
                    (filterWhenEmpty ?? displayValue).trim()
                  )}
            </button>
          )}
          {(onSearch || searchLoadingProp !== undefined) &&
            !searchLoading &&
            displayValue.trim() &&
            resolvedOptions.length === 0 &&
            !showCreate && (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                {noResultsMessage}
              </p>
            )}
        </div>
      </div>
    ) : null;

  return (
    <div className={label ? "space-y-2" : undefined}>
      {label && (
        <label className="block text-sm font-medium text-foreground">
          {label}
        </label>
      )}
      <div ref={containerRef} className={cn("relative", containerClassName ?? "max-w-md")}>
        <Input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={displayValue}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={listId}
          id={inputId}
          onChange={(e) => {
            onDisplayValueChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            onFocus?.();
          }}
          onKeyDown={(e) => {
            if (!open) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlightedIndex((prev) =>
                prev < optionCount - 1 ? prev + 1 : 0
              );
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlightedIndex((prev) =>
                prev > 0 ? prev - 1 : optionCount - 1
              );
            }
            if (e.key === "Enter") {
              if (highlightedIndex >= 0) {
                e.preventDefault();
                selectOption(highlightedIndex);
              }
            }
            if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          disabled={disabled}
          className={cn("w-full text-sm", inputClassName)}
          trailingIcon={trailingIcon}
        />
        {dropdownContent && createPortal(dropdownContent, document.body)}
      </div>
    </div>
  );
}
