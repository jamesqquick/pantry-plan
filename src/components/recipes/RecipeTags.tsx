import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { TagToggle } from "@/components/ui/TagToggle";

interface RecipeTagsProps {
  allTags: { id: string; name: string }[];
  selectedTagIds: Set<string>;
  newTagNames: string[];
  onToggleTag: (id: string) => void;
  onNewTagNamesChange: (names: string[]) => void;
  disabled?: boolean;
}

export function RecipeTags({
  allTags,
  selectedTagIds,
  newTagNames,
  onToggleTag,
  onNewTagNamesChange,
  disabled = false,
}: RecipeTagsProps) {
  const listboxId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const trimmedQuery = query.trim();
  const normalizedQuery = trimmedQuery.toLowerCase();
  const matches = trimmedQuery
    ? allTags.filter((tag) =>
        !selectedTagIds.has(tag.id) && tag.name.toLowerCase().includes(normalizedQuery))
    : [];
  const alreadySelected = trimmedQuery.length > 0 && (
    allTags.some((tag) => selectedTagIds.has(tag.id) && tag.name.toLowerCase() === normalizedQuery)
    || newTagNames.some((name) => name.toLowerCase() === normalizedQuery)
  );
  const canCreate = trimmedQuery.length > 0 && !allTags.some((tag) =>
    tag.name.toLowerCase() === normalizedQuery) && !alreadySelected;
  const showResults = open && trimmedQuery.length > 0 && !disabled;
  const optionCount = matches.length + (canCreate ? 1 : 0);
  const activeOption = highlightedIndex >= 0 && highlightedIndex < optionCount
    ? `${listboxId}-option-${highlightedIndex}`
    : undefined;

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (containerRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setHighlightedIndex(-1);
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  function selectExisting(id: string) {
    if (selectedTagIds.size + newTagNames.length >= 50) {
      setError("A recipe can have up to 50 tags.");
      return;
    }
    setError(null);
    onToggleTag(id);
    setQuery("");
    setOpen(false);
    setHighlightedIndex(-1);
  }

  function selectCreate() {
    if (selectedTagIds.size + newTagNames.length >= 50) {
      setError("A recipe can have up to 50 tags.");
      return;
    }
    onNewTagNamesChange([...newTagNames, trimmedQuery]);
    setQuery("");
    setOpen(false);
    setHighlightedIndex(-1);
    setError(null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!showResults || optionCount === 0) return;
      event.preventDefault();
      setHighlightedIndex((current) => event.key === "ArrowDown"
        ? Math.min(current + 1, optionCount - 1)
        : Math.max(current - 1, 0));
    } else if (event.key === "Enter" && query.length > 0) {
      event.preventDefault();
      if (!showResults || optionCount === 0) return;
      const index = Math.max(highlightedIndex, 0);
      if (index < matches.length) selectExisting(matches[index]!.id);
      else if (canCreate) selectCreate();
    } else if (event.key === "Escape") {
      if (showResults) event.preventDefault();
      setOpen(false);
      setHighlightedIndex(-1);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl text-foreground">Tags</h2>
      <div ref={containerRef} className="relative">
        <label htmlFor={`${listboxId}-search`} className="sr-only">Search tags</label>
        <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={`${listboxId}-search`}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showResults}
          aria-controls={showResults && optionCount > 0 ? listboxId : undefined}
          aria-activedescendant={showResults ? activeOption : undefined}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setHighlightedIndex(-1);
            setError(null);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search or create a tag"
          autoComplete="off"
          maxLength={100}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={error ? `${listboxId}-error` : undefined}
          className="h-11 pl-10"
        />
        {showResults && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-input border border-border bg-card p-1 shadow-lg">
            {optionCount > 0 ? (
              <div id={listboxId} role="listbox" aria-label="Tag search results">
                {matches.map((tag, index) => (
                  <button
                    id={`${listboxId}-option-${index}`}
                    key={tag.id}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={index === highlightedIndex}
                    className={`flex min-h-11 w-full min-w-0 items-center break-all rounded-input px-3 py-2 text-left text-sm text-foreground ${index === highlightedIndex ? "bg-primary/10" : "hover:bg-accent"}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectExisting(tag.id)}
                  >
                    {tag.name}
                  </button>
                ))}
                {canCreate && (
                  <button
                    id={`${listboxId}-option-${matches.length}`}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={highlightedIndex === matches.length}
                    className={`flex min-h-11 w-full min-w-0 items-center break-all rounded-input px-3 py-2 text-left text-sm font-medium text-primary-on-card ${highlightedIndex === matches.length ? "bg-primary/10" : "hover:bg-accent"}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={selectCreate}
                  >
                    Create “{trimmedQuery}”
                  </button>
                )}
              </div>
            ) : (
              <p className="px-3 py-2 text-meta text-muted-foreground">Tag already selected.</p>
            )}
          </div>
        )}
      </div>
      {(selectedTagIds.size > 0 || newTagNames.length > 0) && (
        <div role="group" aria-label="Selected tags" className="flex flex-wrap gap-2">
          {allTags.filter((tag) => selectedTagIds.has(tag.id)).map((tag) => (
            <TagToggle key={tag.id} selected className="max-w-full break-all" onClick={() => {
              onToggleTag(tag.id);
              setError(null);
            }} disabled={disabled}>
              <span aria-hidden="true">{tag.name}</span>
              <X size={14} aria-hidden="true" className="shrink-0" />
              <span className="sr-only">Remove {tag.name} from recipe</span>
            </TagToggle>
          ))}
          {newTagNames.map((tag) => (
            <TagToggle key={tag} selected className="max-w-full break-all" onClick={() => {
              onNewTagNamesChange(newTagNames.filter((name) => name !== tag));
              setError(null);
            }} disabled={disabled}>
              <span aria-hidden="true">{tag} (new)</span>
              <X size={14} aria-hidden="true" className="shrink-0" />
              <span className="sr-only">Remove {tag} from recipe</span>
            </TagToggle>
          ))}
        </div>
      )}
      {error && <p id={`${listboxId}-error`} className="text-meta text-destructive">{error}</p>}
    </section>
  );
}
