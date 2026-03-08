import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/** Skeleton for the ingredient details page. Matches view layout (back link, title, detail cards). */
export function IngredientViewSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-5 w-40 rounded-input" aria-hidden />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-9 w-56 max-w-full rounded-input" aria-hidden />
          <Skeleton className="h-6 w-20 rounded-full" aria-hidden />
        </div>
        <Skeleton className="h-10 w-16 rounded-input" aria-hidden />
      </div>

      <Card>
        <CardContent>
          <div className="space-y-4">
            {[
              { labelW: "w-12", valueW: "w-48" },
              { labelW: "w-20", valueW: "w-32" },
              { labelW: "w-24", valueW: "w-20" },
              { labelW: "w-28", valueW: "w-24" },
              { labelW: "w-40", valueW: "w-36" },
              { labelW: "w-28", valueW: "w-16" },
              { labelW: "w-12", valueW: "w-full" },
            ].map(({ labelW, valueW }, i) => (
              <div key={i}>
                <Skeleton
                  className={`mb-1 h-4 ${labelW} rounded-input`}
                  aria-hidden
                />
                <Skeleton
                  className={`h-4 ${valueW} max-w-xs rounded-input`}
                  aria-hidden
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40 rounded-input" aria-hidden />
          <Skeleton className="h-4 w-full max-w-md rounded-input" aria-hidden />
        </CardHeader>
        <CardContent>
          <div>
            <Skeleton className="mb-1 h-4 w-32 rounded-input" aria-hidden />
            <Skeleton className="h-4 w-24 rounded-input" aria-hidden />
          </div>
        </CardContent>
      </Card>

      <Skeleton className="h-10 w-28 rounded-input" aria-hidden />
    </div>
  );
}
