"use client";

import {
  createContext,
  useMemo,
  useState,
  useEffect,
  useCallback,
  useContext,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { Toast } from "@/components/ui/toast";
import { RecipeListRecipeCard, type RecipeListRecipe } from "./recipe-list-recipe-card";
import { RecipeListTagsDropdown } from "./recipe-list-tags-dropdown";

const SORT_OPTIONS = [
  { value: "recently-updated", label: "Recently updated" },
  { value: "name-az", label: "Name (A–Z)" },
  { value: "newest-created", label: "Newest created" },
] as const;

export type SortValue = (typeof SORT_OPTIONS)[number]["value"];

const SORT_TRIGGER_CLASS =
  "rounded-input border border-input bg-background pl-3 pr-8 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

type RecipeListContextValue = {
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  debouncedQuery: string;
  sortOption: SortValue;
  setSortOption: (v: SortValue) => void;
  showToast: (message: string, variant: "success" | "error") => void;
};

const RecipeListContext = createContext<RecipeListContextValue | null>(null);

function useRecipeListContext() {
  const ctx = useContext(RecipeListContext);
  if (!ctx) throw new Error("RecipeListContent must be used inside RecipeListWrapper");
  return ctx;
}

type RecipeListWrapperProps = {
  /** Only context-dependent UI (search + sort). */
  toolbarSlot: ReactNode;
  /** Tags filter dropdown (does not use context). Passed in so the wrapper doesn’t own it. */
  tagsSlot: ReactNode;
  listSlot: ReactNode;
};

export function RecipeListWrapper({
  toolbarSlot,
  tagsSlot,
  listSlot,
}: RecipeListWrapperProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [sortOption, setSortOption] = useState<SortValue>("recently-updated");
  const [toast, setToast] = useState<{
    message: string;
    variant: "success" | "error";
  } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 200);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const showToast = useCallback((message: string, variant: "success" | "error") => {
    setToast({ message, variant });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const contextValue = useMemo<RecipeListContextValue>(
    () => ({
      searchQuery,
      setSearchQuery,
      debouncedQuery,
      sortOption,
      setSortOption,
      showToast,
    }),
    [searchQuery, debouncedQuery, sortOption, showToast]
  );

  return (
    <RecipeListContext.Provider value={contextValue}>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {toolbarSlot}
          {tagsSlot}
        </div>
        {listSlot}
      </div>
      {toast && <Toast message={toast.message} variant={toast.variant} />}
    </RecipeListContext.Provider>
  );
}

/** Search input only. Rendered immediately. */
export function RecipeListSearch() {
  const { searchQuery, setSearchQuery } = useRecipeListContext();

  return (
    <div className="relative w-full flex-1 sm:max-w-xs">
      <label htmlFor="recipe-search" className="sr-only">
        Search recipes
      </label>
      <Search
        className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        id="recipe-search"
        type="search"
        placeholder="Search recipes..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="pl-9"
        autoComplete="off"
      />
    </div>
  );
}

type RecipeListSortAndTagsProps = {
  tags: { id: string; name: string }[];
  currentTagId: string | null;
};

/** Sort and tags dropdowns. Rendered after tags are loaded (inside Suspense). */
export function RecipeListSortAndTags({
  tags,
  currentTagId,
}: RecipeListSortAndTagsProps) {
  const { sortOption, setSortOption } = useRecipeListContext();
  return (
    <div className="flex w-full flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
      <div className="flex w-full items-center gap-2 sm:w-auto">
        <label htmlFor="recipe-sort" className="sr-only">
          Sort recipes
        </label>
        <Select
          value={sortOption}
          onValueChange={(v) => setSortOption(v as SortValue)}
        >
          <SelectTrigger
            id="recipe-sort"
            className={cn("w-full sm:w-auto", SORT_TRIGGER_CLASS)}
          >
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <RecipeListTagsDropdown tags={tags} currentTagId={currentTagId} />
    </div>
  );
}

type RecipeListContentProps = {
  initialRecipes: RecipeListRecipe[];
};

export function RecipeListContent({ initialRecipes }: RecipeListContentProps) {
  const { debouncedQuery, sortOption, showToast } = useRecipeListContext();
  const [recipes, setRecipes] = useState<RecipeListRecipe[]>(initialRecipes);

  useEffect(() => {
    setRecipes(initialRecipes);
  }, [initialRecipes]);

  const filteredAndSorted = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    const list = q
      ? recipes.filter((r) => r.title.toLowerCase().includes(q))
      : [...recipes];

    if (sortOption === "recently-updated") {
      list.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } else if (sortOption === "name-az") {
      list.sort((a, b) =>
        a.title.localeCompare(b.title, "en", { sensitivity: "base" })
      );
    } else {
      list.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }
    return list;
  }, [recipes, debouncedQuery, sortOption]);

  const handleDelete = useCallback((id: string) => {
    setRecipes((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return (
    <>
      {initialRecipes.length === 0 ? (
        <p className="mt-6 text-muted-foreground">
          No recipes yet.{" "}
          <Link href="/recipes/new" className="underline">
            Add one
          </Link>
          .
        </p>
      ) : filteredAndSorted.length === 0 ? (
        <p className="mt-6 text-muted-foreground">
          No recipes match &quot;{debouncedQuery}&quot;.
        </p>
      ) : (
        <ul
          className="mt-6 grid min-w-0 auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3"
          role="list"
        >
          {filteredAndSorted.map((r) => (
            <li key={r.id} className="flex min-w-0">
              <RecipeListRecipeCard
                recipe={r}
                onDelete={handleDelete}
                onToast={showToast}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
