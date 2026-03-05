"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { AppIcon } from "@/components/ui/icons";
import { SearchablePicker } from "@/components/ui/searchable-picker";

export type TagOption = { id: string; name: string };

const SEARCH_DEBOUNCE_MS = 300;

type RecipeTagPickerProps = {
  existingTags?: TagOption[];
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
  onSearchTags?: (query: string) => Promise<TagOption[]>;
  onCreateTag: (name: string) => Promise<TagOption | null>;
  onDeleteTag?: (tagId: string) => Promise<boolean>;
  disabled?: boolean;
};

export function RecipeTagPicker({
  existingTags = [],
  selectedTagIds,
  onChange,
  onSearchTags,
  onCreateTag,
  onDeleteTag,
  disabled = false,
}: RecipeTagPickerProps) {
  const [filter, setFilter] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<TagOption[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [nameById, setNameById] = useState<Record<string, string>>({});

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQueryRef = useRef("");

  useEffect(() => {
    if (!onSearchTags) return;
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
      onSearchTags(trimmed)
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
  }, [filter, onSearchTags]);

  const options = onSearchTags
    ? searchResults.filter((t) => !selectedTagIds.includes(t.id))
    : existingTags.filter((t) => !selectedTagIds.includes(t.id));

  const getChipName = useCallback(
    (id: string) => nameById[id] ?? existingTags.find((t) => t.id === id)?.name ?? id,
    [nameById, existingTags]
  );

  const addTag = useCallback(
    (tag: TagOption) => {
      if (selectedTagIds.includes(tag.id)) return;
      onChange([...selectedTagIds, tag.id]);
      setNameById((prev) => ({ ...prev, [tag.id]: tag.name }));
      setFilter("");
      setCreateError(null);
    },
    [selectedTagIds, onChange]
  );

  const handleCreate = useCallback(
    async (name: string) => {
      setCreateError(null);
      try {
        const tag = await onCreateTag(name);
        if (tag) {
          addTag(tag);
          return tag;
        }
        setCreateError("Could not create tag");
        return null;
      } catch {
        setCreateError("Could not create tag");
        return null;
      }
    },
    [onCreateTag, addTag]
  );

  const handleChipRemove = useCallback(
    async (tagId: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (onDeleteTag) {
        const removed = await onDeleteTag(tagId);
        if (removed) {
          onChange(selectedTagIds.filter((id) => id !== tagId));
        }
      } else {
        onChange(selectedTagIds.filter((id) => id !== tagId));
      }
    },
    [onDeleteTag, onChange, selectedTagIds]
  );

  const showCreate =
    filter.trim() &&
    !options.some((t) => t.name.toLowerCase() === filter.trim().toLowerCase());

  return (
    <div className="space-y-2">
      <SearchablePicker<TagOption>
        options={options}
        getItemId={(t) => t.id}
        getItemLabel={(t) => t.name}
        onSelect={addTag}
        onCreate={showCreate ? handleCreate : undefined}
        placeholder="ex. cookies"
        disabled={disabled}
        label="Tags"
        displayValue={filter}
        onDisplayValueChange={(v) => {
          setFilter(v);
          setCreateError(null);
        }}
        listboxDataAttribute="data-tag-picker-list"
        emptyMessage="Type to search tags"
        createButtonLabel={(f) => `Create new tag "${f}"`}
        noResultsMessage="No tags found. Create one above."
        searchLoading={onSearchTags ? searchLoading : undefined}
      />
      {selectedTagIds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedTagIds.map((tagId) => (
            <span
              key={tagId}
              className="inline-flex items-center gap-1 rounded-full bg-accent pr-1 text-sm font-medium text-accent-foreground"
            >
              <span className="rounded-l-full pl-3 py-1">{getChipName(tagId)}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={(e) => handleChipRemove(tagId, e)}
                className="shrink-0 cursor-pointer rounded-full p-0.5 opacity-60 transition-opacity hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label={`Remove tag ${getChipName(tagId)}`}
              >
                <AppIcon name="close" size={12} aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
      {createError && (
        <p className="text-sm text-destructive" role="alert">
          {createError}
        </p>
      )}
    </div>
  );
}
