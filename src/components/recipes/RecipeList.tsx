import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Camera, Clock3, Search, Users } from "lucide-react";
import { fuzzyFilterRecipes } from "@/lib/search/fuzzy-recipe";
import { formatTagName } from "@/lib/tags";
import { Button } from "@/components/ui/Button";
import { TagBadge } from "@/components/ui/TagBadge";
import { TagToggle } from "@/components/ui/TagToggle";
import { formatTotalTime, monogram, sourceLabel, toneFor, topTags } from "./recipe-card-utils";
import "./RecipeList.css";

export type RecipeCardData = {
  id: string;
  title: string;
  imageUrl: string | null;
  sourceUrl: string | null;
  servings: number | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  totalTimeMinutes: number | null;
  lastViewedAt: number | null;
  updatedAt: number;
  tags: { id: string; name: string }[];
};

export interface RecipeListProps {
  recipes: RecipeCardData[];
  allTags: { id: string; name: string; n: number }[];
}

export default function RecipeList({ recipes, allTags }: RecipeListProps) {
  const [query, setQuery] = useState("");
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const [showAllTags, setShowAllTags] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const rankedTags = topTags(allTags);
  const visibleTags = showAllTags ? rankedTags : rankedTags.slice(0, 6);
  const selectedTag = rankedTags.find((tag) => tag.id === selectedTagId);
  if (selectedTag && !visibleTags.some((tag) => tag.id === selectedTag.id)) {
    visibleTags.push(selectedTag);
  }
  const hiddenTagCount = rankedTags.length - visibleTags.length;

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      const target = event.target;
      if (
        event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey ||
        event.shiftKey || event.isComposing || event.defaultPrevented
      ) return;
      if (
        target instanceof Element &&
        target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")
      ) return;
      if (!searchRef.current) return;
      event.preventDefault();
      searchRef.current.focus();
    }
    document.addEventListener("keydown", focusSearch);
    return () => document.removeEventListener("keydown", focusSearch);
  }, []);

  // Fuzzy title match for query, exact tag-id match for the tag filter.
  const filtered = useMemo(() => {
    let list = recipes;
    if (selectedTagId) {
      list = list.filter((r) => r.tags.some((t) => t.id === selectedTagId));
    }
    if (query.trim().length > 0) {
      const matched = fuzzyFilterRecipes(
        list.map((r) => ({ id: r.id, title: r.title })),
        query
      );
      const idOrder = new Map(matched.map((o, i) => [o.id, i]));
      list = list
        .filter((r) => idOrder.has(r.id))
        .sort((a, b) => idOrder.get(a.id)! - idOrder.get(b.id)!);
    }
    return list;
  }, [recipes, query, selectedTagId]);

  if (recipes.length === 0) {
    return (
      <div className="recipe-empty">
        <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary-icon-bg text-primary-icon-fg">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-7 w-7"
            aria-hidden="true"
          >
            <path d="M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z" />
            <path d="M6 17h12" />
          </svg>
        </div>
        <h2 className="font-display text-xl text-card-foreground">
          Your recipe box is empty
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Create your first recipe to start planning meals.
        </p>
        <Button href="/recipes/new" className="mt-6">
          New recipe
        </Button>
      </div>
    );
  }

  return (
    <div className="recipe-list">
      <div className="recipe-toolbar">
        <label className="recipe-search">
          <span className="sr-only">Search recipes by title</span>
          <Search aria-hidden="true" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your recipes"
            aria-keyshortcuts="/"
          />
          <kbd aria-hidden="true">/</kbd>
        </label>

        <div className="recipe-filter-row">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by tag">
            <TagToggle
              selected={selectedTagId === null}
              onClick={() => setSelectedTagId(null)}
              count={recipes.length}
              size="default"
              className="min-h-11"
            >
              All
            </TagToggle>
            {visibleTags.map((t) => (
              <TagToggle
                key={t.id}
                selected={selectedTagId === t.id}
                onClick={() =>
                  setSelectedTagId((prev) => (prev === t.id ? null : t.id))
                }
                count={t.n}
                size="default"
                className="min-h-11"
              >
                {formatTagName(t.name)}
              </TagToggle>
            ))}
            {(hiddenTagCount > 0 || (showAllTags && rankedTags.length > 6)) && (
              <button
                type="button"
                className="recipe-more-tags"
                aria-expanded={showAllTags}
                onClick={() => setShowAllTags((prev) => !prev)}
              >
                {showAllTags ? "Less" : `+${hiddenTagCount} more`}
              </button>
            )}
          </div>
          <p className="recipe-result-count" role="status" aria-atomic="true">
            Showing {filtered.length} of {recipes.length}
          </p>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="recipe-empty">
          <h2 className="font-display text-2xl text-foreground">Nothing here yet.</h2>
          <p className="mt-2 text-muted-foreground">
            No recipes match{query.trim() ? ` "${query.trim()}"` : ""}{selectedTag ? ` in ${formatTagName(selectedTag.name)}` : ""}.
            {" "}Try another search or clear the filters.
          </p>
          <Button
            variant="secondary"
            className="mt-6"
            onClick={() => {
              setQuery("");
              setSelectedTagId(null);
              searchRef.current?.focus();
            }}
          >
            Clear search and filters
          </Button>
        </div>
      ) : (
        <ul className="recipe-grid" aria-label="Recipes">
          {filtered.map((r, index) => {
            const time = formatTotalTime(r);
            const source = sourceLabel(r.sourceUrl);
            return (
              <li key={r.id} style={{ "--i": Math.min(index, 12) } as CSSProperties}>
                <article className="recipe-card">
                  <div className={`recipe-media${r.imageUrl ? "" : ` recipe-fallback tone-${toneFor(r.title)}`}`}>
                    {r.imageUrl ? (
                      <img src={r.imageUrl} alt="" loading="lazy" />
                    ) : (
                      <>
                        <span className="recipe-initial font-display" aria-hidden="true">{monogram(r.title)}</span>
                        <a
                          href={`/recipes/${r.id}/edit`}
                          className="recipe-add-photo"
                          aria-label={`Add photo to ${r.title}`}
                        >
                          <Camera aria-hidden="true" /> Add photo
                        </a>
                      </>
                    )}
                  </div>
                  <div className="recipe-card-body">
                    <p className="recipe-source" title={source}>{source}</p>
                    <h2 className="recipe-card-title font-display">
                      <a href={`/recipes/${r.id}`}>{r.title}</a>
                    </h2>
                    {r.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {r.tags.slice(0, 2).map((t) => (
                          <TagBadge key={t.id} name={t.name} size="sm" />
                        ))}
                        {r.tags.length > 2 && (
                          <span
                            className="rounded-full bg-tag px-2.5 py-1 text-[0.72rem] font-semibold leading-none text-tag-foreground"
                            aria-label={`${r.tags.length - 2} more tags`}
                          >
                            +{r.tags.length - 2}
                          </span>
                        )}
                      </div>
                    )}
                    {(time != null || r.servings != null) && (
                      <div className="recipe-meta">
                        {time != null && <span><Clock3 aria-hidden="true" />{time}</span>}
                        {r.servings != null && <span><Users aria-hidden="true" />{r.servings} {r.servings === 1 ? "serving" : "servings"}</span>}
                      </div>
                    )}
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
