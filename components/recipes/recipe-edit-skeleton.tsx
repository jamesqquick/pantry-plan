import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

/** Skeleton for the recipe edit page. Matches edit page layout (back link, title, form cards). */
export function RecipeEditSkeleton() {
  return (
    <div className="space-y-8">
      <Skeleton className="h-5 w-28 rounded-input" aria-hidden />
      <Skeleton className="h-8 w-40 rounded-input" aria-hidden />

      <div className="space-y-6">
        {/* Recipe Metadata card */}
        <Card>
          <CardContent>
            <Skeleton className="mb-6 h-6 w-32 rounded-input" aria-hidden />
            <div className="space-y-6">
              <div>
                <Skeleton className="mb-2 h-4 w-12 rounded-input" aria-hidden />
                <Skeleton className="h-10 w-full rounded-input" aria-hidden />
              </div>
              <div>
                <Skeleton className="mb-2 h-4 w-20 rounded-input" aria-hidden />
                <Skeleton className="h-10 w-full rounded-input" aria-hidden />
              </div>
              <div>
                <Skeleton className="mb-2 h-4 w-20 rounded-input" aria-hidden />
                <Skeleton className="h-10 w-full rounded-input" aria-hidden />
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i}>
                    <Skeleton className="mb-2 h-4 w-14 rounded-input" aria-hidden />
                    <Skeleton className="h-10 w-full rounded-input" aria-hidden />
                  </div>
                ))}
              </div>
              <Skeleton className="h-10 w-24 rounded-full" aria-hidden />
              <div>
                <Skeleton className="mb-2 h-4 w-12 rounded-input" aria-hidden />
                <Skeleton className="h-20 w-full rounded-input" aria-hidden />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ingredients card */}
        <Card>
          <CardContent>
            <Skeleton className="mb-6 h-6 w-28 rounded-input" aria-hidden />
            <div className="space-y-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-10 flex-1 rounded-input" aria-hidden />
                  <Skeleton className="h-9 w-9 shrink-0 rounded-input" aria-hidden />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Instructions card */}
        <Card>
          <CardContent>
            <Skeleton className="mb-6 h-6 w-32 rounded-input" aria-hidden />
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-6 w-6 shrink-0 rounded-full" aria-hidden />
                  <Skeleton className="h-10 flex-1 rounded-input" aria-hidden />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Action buttons */}
        <div className="flex gap-2">
          <Skeleton className="h-10 w-28 rounded-input" aria-hidden />
          <Skeleton className="h-10 w-20 rounded-input" aria-hidden />
        </div>
      </div>
    </div>
  );
}
