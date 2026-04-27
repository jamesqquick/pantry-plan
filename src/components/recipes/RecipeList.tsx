import { useMemo, useState } from "react";
import { fuzzyFilterRecipes } from "@/lib/search/fuzzy-recipe";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { TagBadge } from "@/components/ui/TagBadge";
import { TagToggle } from "@/components/ui/TagToggle";

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

function buildMeta(r: RecipeCardData): string[] {
  const out: string[] = [];
  if (r.prepTimeMinutes != null) out.push(`Prep ${r.prepTimeMinutes}m`);
  if (r.cookTimeMinutes != null) out.push(`Cook ${r.cookTimeMinutes}m`);
  if (r.totalTimeMinutes != null && out.length === 0) {
    out.push(`${r.totalTimeMinutes}m total`);
  }
  if (r.servings != null) out.push(`${r.servings} servings`);
  return out;
}

export default function RecipeList({ recipes, allTags }: RecipeListProps) {
  const [query, setQuery] = useState("");
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);

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
      <div className="rounded-lg border border-dashed border-border bg-card/50 p-12 text-center">
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
        <h2 className="font-display text-xl text-primary-on-background">
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
    <div className="space-y-6">
      <div className="flex flex-col gap-3">
        <label className="relative block w-full">
          <span className="sr-only">Search recipes</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title…"
            className="pl-9"
          />
        </label>

        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <TagToggle
              selected={selectedTagId === null}
              onClick={() => setSelectedTagId(null)}
            >
              All
            </TagToggle>
            {allTags.map((t) => (
              <TagToggle
                key={t.id}
                selected={selectedTagId === t.id}
                onClick={() =>
                  setSelectedTagId((prev) => (prev === t.id ? null : t.id))
                }
              >
                {t.name}{" "}
                <span className="opacity-60">· {t.n}</span>
              </TagToggle>
            ))}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-card/50 py-10 text-center text-sm text-muted-foreground">
          No matching recipes.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => (
            <li key={r.id}>
              <a
                href={`/recipes/${r.id}`}
                className="group block h-full overflow-hidden rounded-2xl border border-border bg-card transition-all duration-200 ease-out hover:border-primary/40 hover:shadow-lg hover:-translate-y-0.5"
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-panel">
                  {r.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={r.imageUrl}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-10 w-10"
                        aria-hidden="true"
                      >
                        <path d="M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z" />
                        <path d="M6 17h12" />
                      </svg>
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h2 className="line-clamp-2 font-display text-lg text-card-foreground">
                    {r.title}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {buildMeta(r).join(" · ") || "No timing info"}
                  </p>
                  {r.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {r.tags.slice(0, 3).map((t) => (
                        <TagBadge key={t.id} name={t.name} size="sm" />
                      ))}
                      {r.tags.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{r.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
