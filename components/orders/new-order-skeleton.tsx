import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";

/** Skeleton for the new order page. Matches layout: title, optional callout, order form card. */
export function NewOrderSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-36 rounded-input" aria-hidden />

      <Callout variant="info" className="text-info">
        <Skeleton className="h-5 w-3/4 max-w-md rounded-input" aria-hidden />
        <Skeleton className="mt-2 h-4 w-full max-w-lg rounded-input" aria-hidden />
      </Callout>

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
          <Skeleton className="h-10 w-24 rounded-input" aria-hidden />
        </CardContent>
      </Card>
    </div>
  );
}
