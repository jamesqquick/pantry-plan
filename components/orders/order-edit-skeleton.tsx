import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/** Skeleton for the order edit page. Matches layout: back link, title, order form card. */
export function OrderEditSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-5 w-32 rounded-input" aria-hidden />
      <Skeleton className="h-9 w-40 rounded-input" aria-hidden />

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-28 rounded-input" aria-hidden />
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Skeleton className="mb-2 h-4 w-16 rounded-input" aria-hidden />
            <Skeleton className="h-10 w-full rounded-input" aria-hidden />
          </div>
          <div>
            <Skeleton className="mb-2 h-4 w-12 rounded-input" aria-hidden />
            <Skeleton className="h-20 w-full rounded-input" aria-hidden />
          </div>
          <Skeleton className="mb-2 h-4 w-14 rounded-input" aria-hidden />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-10 flex-1 rounded-input" aria-hidden />
                <Skeleton className="h-10 w-20 rounded-input" aria-hidden />
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-2">
            <Skeleton className="h-10 w-24 rounded-input" aria-hidden />
            <Skeleton className="h-10 w-20 rounded-input" aria-hidden />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
