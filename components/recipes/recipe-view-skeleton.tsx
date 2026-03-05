import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

/** Skeleton for the recipe details page. Matches RecipeView layout and dimensions. */
export function RecipeViewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-5 w-24 rounded-input" aria-hidden />
        <Skeleton className="h-9 w-28 rounded-input" aria-hidden />
      </div>
      <article className="space-y-6">
        {/* Image placeholder - same aspect and max dimensions as RecipeView */}
        <div className="aspect-16/10 w-full max-h-[400px] overflow-hidden rounded-input sm:mx-auto sm:max-w-2xl">
          <Skeleton className="h-full w-full rounded-input" aria-hidden />
        </div>
        {/* Title row: title + tags + action buttons */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <Skeleton className="mb-6 h-9 w-3/4 max-w-md rounded-input" aria-hidden />
            <div className="mt-2 flex flex-wrap gap-2">
              <Skeleton className="h-6 w-16 rounded-full" aria-hidden />
              <Skeleton className="h-6 w-20 rounded-full" aria-hidden />
              <Skeleton className="h-6 w-14 rounded-full" aria-hidden />
            </div>
            <Skeleton className="mt-1 h-4 w-14 rounded-input" aria-hidden />
          </div>
          <div className="flex shrink-0 flex-nowrap items-center gap-2">
            <Skeleton className="h-9 w-9 shrink-0 rounded-input" aria-hidden />
            <Skeleton className="h-9 w-9 shrink-0 rounded-input" aria-hidden />
            <Skeleton className="h-9 w-9 shrink-0 rounded-input" aria-hidden />
          </div>
        </div>
        {/* Metadata card */}
        <Card>
          <CardContent>
            <Skeleton className="mb-6 h-6 w-32 rounded-input" aria-hidden />
            <ul className="grid grid-cols-1 gap-x-6 gap-y-4 min-[480px]:grid-cols-2 md:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <li key={i} className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 shrink-0 rounded-input" aria-hidden />
                  <div className="flex min-w-0 flex-col gap-1">
                    <Skeleton className="h-3 w-16 rounded-input" aria-hidden />
                    <Skeleton className="h-4 w-12 rounded-input" aria-hidden />
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        {/* Ingredients card */}
        <Card>
          <CardContent>
            <Skeleton className="mb-6 h-6 w-28 rounded-input" aria-hidden />
            <ol className="mt-2 list-none space-y-4 pl-0">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <li key={i} className="flex items-center gap-3">
                  <Skeleton className="h-6 w-6 shrink-0 rounded-full" aria-hidden />
                  <Skeleton className="h-4 flex-1 rounded-input" aria-hidden />
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
        {/* Instructions card */}
        <Card>
          <CardContent>
            <Skeleton className="mb-6 h-6 w-32 rounded-input" aria-hidden />
            <ol className="mt-2 list-none space-y-4 pl-0">
              {[1, 2, 3, 4, 5].map((i) => (
                <li key={i} className="flex items-center gap-3">
                  <Skeleton className="h-6 w-6 shrink-0 rounded-full" aria-hidden />
                  <Skeleton className="h-4 flex-1 rounded-input" aria-hidden />
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </article>
    </div>
  );
}
