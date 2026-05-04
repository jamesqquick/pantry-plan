import { useRef, useState, useEffect } from "react";
import { Input } from "@/components/ui/Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";

export type IngredientListItem = {
  id: string;
  name: string;
  userId: string | null;
  category: string | null;
};

export interface IngredientListProps {
  ingredients: IngredientListItem[];
  search: string;
  category: string;
  source: string;
  categories: string[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

function buildQueryString(
  params: Record<string, string | number>,
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    const s = String(v);
    if (s && s !== "all" && !(k === "page" && s === "1") && !(k === "limit" && s === "25")) {
      sp.set(k, s);
    }
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export default function IngredientList({
  ingredients,
  search: initialSearch,
  category: initialCategory,
  source: initialSource,
  categories,
  totalCount,
  page,
  limit,
  totalPages,
}: IngredientListProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLInputElement>(null);
  const sourceRef = useRef<HTMLInputElement>(null);
  const [searchValue, setSearchValue] = useState(initialSearch);

  // Debounced search — submit the form 300ms after the user stops typing.
  useEffect(() => {
    if (searchValue === initialSearch) return;
    const t = setTimeout(() => {
      formRef.current?.requestSubmit();
    }, 300);
    return () => clearTimeout(t);
  }, [searchValue, initialSearch]);

  function submitForm() {
    formRef.current?.requestSubmit();
  }

  const baseParams = {
    search: initialSearch,
    category: initialCategory,
    source: initialSource,
    limit,
  };

  const prevHref =
    page > 1
      ? `/ingredients${buildQueryString({ ...baseParams, page: page - 1 })}`
      : null;
  const nextHref =
    page < totalPages
      ? `/ingredients${buildQueryString({ ...baseParams, page: page + 1 })}`
      : null;

  if (ingredients.length === 0 && !initialSearch && !initialCategory && initialSource === "all") {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card/50 p-12 text-center">
        <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary-icon-bg text-primary-icon-fg">
          {/* Lucide Carrot */}
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
            <path d="M2.27 21.7s9.87-3.5 12.73-6.36a4.5 4.5 0 0 0-6.36-6.37C5.77 11.84 2.27 21.7 2.27 21.7" />
            <path d="M8.64 14l-2.05-2.04M15.34 15l-2.46-2.46" />
            <path d="M22 9s-1.33-2-3.5-2C16.86 7 15 9 15 9s1.33 2 3.5 2S22 9 22 9" />
            <path d="M15 2s-2 1.33-2 3.5S15 9 15 9s2-1.33 2-3.5S15 2 15 2" />
          </svg>
        </div>
        <h2 className="font-display text-xl text-card-foreground">
          No custom ingredients yet
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse the global catalog or create your first custom ingredient.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <form
        ref={formRef}
        method="get"
        action="/ingredients"
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <label className="relative block w-full">
            <span className="sr-only">Search ingredients</span>
            {/* Lucide Search */}
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
              ref={searchInputRef}
              type="search"
              name="search"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search by name…"
              className="pl-9"
            />
          </label>
        </div>

        <input ref={categoryRef} type="hidden" name="category" value={initialCategory} />
        <input ref={sourceRef} type="hidden" name="source" value={initialSource} />

        <div className="flex gap-2">
          <div className="w-full sm:w-44">
            <Select
              value={initialCategory || "all"}
              onValueChange={(val) => {
                if (categoryRef.current) {
                  categoryRef.current.value = val === "all" ? "" : val;
                }
                submitForm();
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-full sm:w-36">
            <Select
              value={initialSource}
              onValueChange={(val) => {
                if (sourceRef.current) {
                  sourceRef.current.value = val;
                }
                submitForm();
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="global">Global</SelectItem>
                <SelectItem value="mine">My ingredients</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </form>

      {/* Results info */}
      <p className="text-xs text-muted-foreground">
        {totalCount === 0
          ? "No ingredients match your filters."
          : `${totalCount} ingredient${totalCount === 1 ? "" : "s"} found.`}
      </p>

      {/* List */}
      {ingredients.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {ingredients.map((ing) => (
            <li key={ing.id}>
              <a
                href={`/ingredients/${ing.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-primary/5 cursor-pointer"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-card-foreground">
                    {ing.name}
                  </p>
                  {ing.category && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {ing.category}
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-tight ${
                    ing.userId === null
                      ? "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                      : "bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300"
                  }`}
                >
                  {ing.userId === null ? "Global" : "Custom"}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <nav className="flex items-center justify-between gap-4 text-sm">
          {prevHref ? (
            <a
              href={prevHref}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              {/* Lucide ChevronLeft */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
              Previous
            </a>
          ) : (
            <span />
          )}

          <span className="text-muted-foreground tabular-nums">
            Page {page} of {totalPages}
          </span>

          {nextHref ? (
            <a
              href={nextHref}
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Next
              {/* Lucide ChevronRight */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden="true"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </a>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
