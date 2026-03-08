import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

/** Skeleton for the order detail page. Matches layout: back link, header, items table, grocery list, cost. */
export function OrderDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-5 w-24 rounded-input" aria-hidden />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Skeleton className="h-9 w-56 max-w-full rounded-input" aria-hidden />
          <Skeleton className="mt-1 h-4 w-3/4 max-w-sm rounded-input" aria-hidden />
        </div>
        <Skeleton className="h-10 w-24 shrink-0 rounded-input" aria-hidden />
      </div>

      <section>
        <Skeleton className="h-6 w-16 rounded-input" aria-hidden />
        <div className="mt-2 overflow-hidden rounded-input border border-border">
          <div className="flex border-b border-border bg-muted">
            <div className="w-2/3 border-r border-border px-3 py-2">
              <Skeleton className="h-4 w-12 rounded-input" aria-hidden />
            </div>
            <div className="w-1/3 px-3 py-2">
              <Skeleton className="h-4 w-14 rounded-input" aria-hidden />
            </div>
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex border-b border-border last:border-b-0">
              <div className="w-2/3 border-r border-border px-3 py-2">
                <Skeleton className="h-4 w-40 rounded-input" aria-hidden />
              </div>
              <div className="w-1/3 px-3 py-2">
                <Skeleton className="h-4 w-8 rounded-input" aria-hidden />
              </div>
            </div>
          ))}
        </div>
      </section>

      <Card>
        <CardContent>
          <Skeleton className="mb-4 h-6 w-28 rounded-input" aria-hidden />
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <Skeleton className="h-4 flex-1 max-w-xs rounded-input" aria-hidden />
                <Skeleton className="h-4 w-20 rounded-input" aria-hidden />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <section>
        <Skeleton className="h-6 w-32 rounded-input" aria-hidden />
        <Skeleton className="mt-2 h-7 w-24 rounded-input" aria-hidden />
      </section>
    </div>
  );
}
