"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { AppIcon } from "@/components/ui/icons";
import { SearchablePicker } from "@/components/ui/searchable-picker";

export type CatalogItem = { id: string; name: string; source?: "global" | "custom" };

const MAX_RESULTS = 10;
const SEARCH_DEBOUNCE_MS = 300;

export function ImportIngredientPicker({
  catalog,
  value,
  displayLabel,
  onChange,
  placeholder = "Search or choose",
  onCreateNew,
  onSelectNew,
  onSearch,
  selectedIngredientName,
  inputClassName,
}: {
  catalog: CatalogItem[];
  value: string;
  displayLabel?: string;
  onChange: (ingredientId: string, name: string) => void;
  placeholder?: string;
  onCreateNew?: (name: string) => void;
  onSelectNew?: (name: string) => Promise<{ id: string; name: string } | null>;
  onSearch?: (query: string) => Promise<CatalogItem[]>;
  selectedIngredientName?: string;
  inputClassName?: string;
}) {
  const [filter, setFilter] = useState("");
  const [searchResults, setSearchResults] = useState<CatalogItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQueryRef = useRef("");
  const skipSearchUntilUserChangeRef = useRef(false);

  const selectedName =
    selectedIngredientName ?? catalog.find((i) => i.id === value)?.name ?? "";

  const clientFiltered = useMemo(() => {
    if (!onSearch) {
      if (!filter.trim()) return catalog.slice(0, MAX_RESULTS);
      const q = filter.toLowerCase();
      return catalog
        .filter((i) => i.name.toLowerCase().includes(q) || i.id === value)
        .slice(0, MAX_RESULTS);
    }
    return [];
  }, [catalog, filter, value, onSearch]);

  const options = onSearch ? searchResults : clientFiltered;

  useEffect(() => {
    if (!onSearch) return;
    if (skipSearchUntilUserChangeRef.current) {
      skipSearchUntilUserChangeRef.current = false;
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const trimmed = filter.trim();
    if (trimmed === "") {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      lastQueryRef.current = trimmed;
      setSearchLoading(true);
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
          if (lastQueryRef.current === trimmed) setSearchLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [filter, onSearch]);

  const displayValue = filter || selectedName || displayLabel || "";

  const handleCreate = async (name: string): Promise<CatalogItem | null> => {
    if (onSelectNew) {
      const result = await onSelectNew(name);
      if (result) {
        onChange(result.id, result.name);
        return { id: result.id, name: result.name };
      }
      return null;
    }
    onCreateNew?.(name);
    setFilter("");
    return null;
  };

  return (
    <div className="relative w-full min-w-0">
      <SearchablePicker<CatalogItem>
        options={options}
        getItemId={(i) => i.id}
        getItemLabel={(i) => i.name}
        onSelect={(i) => {
          onChange(i.id, i.name);
          setFilter("");
        }}
        onCreate={onCreateNew || onSelectNew ? handleCreate : undefined}
        placeholder={placeholder}
        displayValue={displayValue}
        onDisplayValueChange={(v) => {
          setFilter(v);
          const match = catalog.find(
            (i) => i.name.toLowerCase() === v.toLowerCase()
          );
          if (match) onChange(match.id, match.name);
        }}
        listboxDataAttribute="data-ingredient-picker-list"
        emptyMessage="Type to search ingredients"
        noResultsMessage="No ingredients found"
        createButtonLabel={(f) => `Create "${f}"`}
        inputClassName={inputClassName}
        trailingIcon={<AppIcon name="search" size={16} aria-hidden />}
        containerClassName="w-full min-w-0"
        searchLoading={onSearch ? searchLoading : undefined}
        onFocus={() => {
          if (!filter && (selectedName || displayLabel)) {
            skipSearchUntilUserChangeRef.current = true;
            setFilter(selectedName || displayLabel || "");
          }
        }}
        renderOption={(i) => (
          <>
            <span>{i.name}</span>
            {i.source && (
              <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                {i.source === "global" ? "Global" : "User created"}
              </span>
            )}
          </>
        )}
      />
    </div>
  );
}
