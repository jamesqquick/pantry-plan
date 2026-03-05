import { PageTitle } from "@/components/ui/page-title";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";

function RecipeCardSkeleton() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-input border border-border bg-card">
      <Skeleton className="aspect-video w-full shrink-0 rounded-t-input rounded-b-none" />
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <Skeleton className="h-6 w-3/4 max-w-xs rounded-input" />
        <div className="mt-2 flex gap-4">
          <Skeleton className="h-4 w-16 rounded-input" />
          <Skeleton className="h-4 w-20 rounded-input" />
        </div>
        <div className="mt-2 flex gap-1.5">
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
        <div className="mt-4 flex flex-1 flex-col justify-end">
          <Skeleton className="h-10 w-full rounded-input" />
        </div>
      </div>
    </div>
  );
}

export function RecipeListSkeleton() {
  return (
    <div className="space-y-4">
      <PageTitle>My recipes</PageTitle>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <Skeleton className="h-14 flex-1 rounded-input sm:max-w-xs" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-14 w-32 rounded-input" />
            <Skeleton className="h-14 w-24 rounded-input" />
          </div>
        </div>
        <Skeleton className="h-14 w-24 rounded-input" />
      </div>

      <RecipeListGridSkeleton />
    </div>
  );
}

/** Single dropdown trigger skeleton matching SelectTrigger size (h-14 from ui/select). */
function DropdownTriggerSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <Skeleton
      className={cn(
        "h-14 rounded-input border border-input",
        className
      )}
      aria-hidden
    />
  );
}

/** Skeletons for sort and tags dropdowns until toolbar data is ready. Matches final trigger dimensions. */
export function ToolbarDropdownsSkeleton() {
  return (
    <div className="flex w-full items-center gap-2 sm:w-auto" aria-busy aria-live="polite">
      <DropdownTriggerSkeleton className="min-w-44 w-full sm:w-auto sm:min-w-44" />
      <DropdownTriggerSkeleton className="min-w-28 w-full sm:w-auto sm:min-w-28" />
    </div>
  );
}

export function RecipeListGridSkeleton() {
  return (
    <ul
      className="mt-6 grid min-w-0 auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3"
      role="list"
      aria-hidden
    >
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <li key={i} className="flex min-w-0">
          <RecipeCardSkeleton />
        </li>
      ))}
    </ul>
  );
}

