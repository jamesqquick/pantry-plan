import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton for the ingredients list only (title and add button render immediately). */
export function IngredientListSkeleton() {
  return (
    <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-14 w-full rounded-input sm:w-64" />
          <Skeleton className="h-14 w-40 rounded-input" />
        </div>

        <ul
          className="divide-y divide-border overflow-hidden rounded-input border border-border bg-card"
          aria-hidden
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => (
            <li
              key={i}
              className="flex min-h-14 flex-wrap items-center justify-between gap-2 px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-32 rounded-input" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-4 w-20 rounded-input" />
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Skeleton className="h-5 w-40 rounded-input" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-9 w-20 rounded-input" />
            <Skeleton className="h-5 w-24 rounded-input" />
            <Skeleton className="h-9 w-14 rounded-input" />
          </div>
        </div>
    </div>
  );
}
