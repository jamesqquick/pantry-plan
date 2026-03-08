import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/** Skeleton for the profile page. Matches layout: title, profile form card, reset password card. */
export function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-9 w-24 rounded-input" aria-hidden />

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32 rounded-input" aria-hidden />
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Skeleton className="mb-2 h-4 w-12 rounded-input" aria-hidden />
            <Skeleton className="h-10 w-full max-w-sm rounded-input" aria-hidden />
          </div>
          <div>
            <Skeleton className="mb-2 h-4 w-16 rounded-input" aria-hidden />
            <Skeleton className="h-10 w-full max-w-sm rounded-input" aria-hidden />
          </div>
          <Skeleton className="h-10 w-28 rounded-input" aria-hidden />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40 rounded-input" aria-hidden />
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Skeleton className="mb-2 h-4 w-32 rounded-input" aria-hidden />
            <Skeleton className="h-10 w-full max-w-sm rounded-input" aria-hidden />
          </div>
          <div>
            <Skeleton className="mb-2 h-4 w-36 rounded-input" aria-hidden />
            <Skeleton className="h-10 w-full max-w-sm rounded-input" aria-hidden />
          </div>
          <Skeleton className="h-10 w-36 rounded-input" aria-hidden />
        </CardContent>
      </Card>
    </div>
  );
}
