"use client";

import { useRef } from "react";
import Link from "next/link";
import { IngredientsSearchInput } from "./ingredients-search-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PrimaryList, type PrimaryListItem } from "@/components/ui/primary-list";

export type IngredientListItem = {
  id: string;
  name: string;
  userId: string | null;
  category: string | null;
};

function buildQueryString(params: {
  search?: string;
  category?: string;
  page?: number;
  limit?: number;
}): string {
  const sp = new URLSearchParams();
  if (params.search?.trim()) sp.set("search", params.search.trim());
  if (params.category?.trim()) sp.set("category", params.category.trim());
  if (params.page != null && params.page > 1) sp.set("page", String(params.page));
  if (params.limit != null) sp.set("limit", String(params.limit));
  const q = sp.toString();
  return q ? `?${q}` : "";
}

export function IngredientList({
  ingredients,
  search,
  category,
  categories,
  totalCount,
  page,
  limit,
  totalPages,
}: {
  ingredients: IngredientListItem[];
  search?: string;
  category?: string;
  categories: string[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}) {
  const showPagination = totalCount > limit;
  const formRef = useRef<HTMLFormElement>(null);
  const categoryInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full min-w-0 sm:w-auto">
          <IngredientsSearchInput defaultValue={search} />
        </div>
        <form
          ref={formRef}
          method="get"
          action="/ingredients"
          className="flex w-full min-w-0 items-center gap-2 sm:w-auto"
        >
          {search?.trim() && (
            <input type="hidden" name="search" value={search.trim()} />
          )}
          {limit !== 25 && (
            <input type="hidden" name="limit" value={String(limit)} />
          )}
          <input
            type="hidden"
            name="category"
            ref={categoryInputRef}
            defaultValue={category ?? ""}
          />
          <Select
            value={category ?? "__none__"}
            onValueChange={(v) => {
              if (categoryInputRef.current)
                categoryInputRef.current.value = v === "__none__" ? "" : v;
              formRef.current?.requestSubmit();
            }}
          >
            <SelectTrigger
              id="category-filter"
              className="w-full rounded-input border border-input bg-background pl-3 pr-8 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-fit"
              aria-label="Filter by category"
            >
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">All categories</SelectItem>
              {categories.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </form>
      </div>
      {ingredients.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No ingredients yet. Add one to get started.
        </p>
      ) : (
        <>
          <PrimaryList
            items={ingredients.map(
              (ing): PrimaryListItem => ({
                id: ing.id,
                primaryText: ing.name,
                badge: ing.userId === null ? "Global" : "User created",
                secondaryText: ing.category ?? undefined,
                href: `/ingredients/${ing.id}`,
              })
            )}
            aria-label="Ingredients"
          />
          {showPagination && (
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>
                Showing {(page - 1) * limit + 1}–
                {Math.min(page * limit, totalCount)} of {totalCount}
              </span>
              <nav className="flex items-center gap-2" aria-label="Pagination">
                {page <= 1 ? (
                  <span
                    className="cursor-not-allowed rounded-input border border-border px-3 py-1.5 text-muted-foreground opacity-50"
                    aria-disabled="true"
                  >
                    Previous
                  </span>
                ) : (
                  <Link
                    href={`/ingredients${buildQueryString({
                      search,
                      category,
                      page: page - 1,
                      limit,
                    })}`}
                    className="rounded-input border border-border px-3 py-1.5 hover:bg-muted"
                  >
                    Previous
                  </Link>
                )}
                <span className="px-1">
                  Page {page} of {totalPages}
                </span>
                {page >= totalPages ? (
                  <span
                    className="cursor-not-allowed rounded-input border border-border px-3 py-1.5 text-muted-foreground opacity-50"
                    aria-disabled="true"
                  >
                    Next
                  </span>
                ) : (
                  <Link
                    href={`/ingredients${buildQueryString({
                      search,
                      category,
                      page: page + 1,
                      limit,
                    })}`}
                    className="rounded-input border border-border px-3 py-1.5 hover:bg-muted"
                  >
                    Next
                  </Link>
                )}
              </nav>
            </div>
          )}
        </>
      )}
    </div>
  );
}
