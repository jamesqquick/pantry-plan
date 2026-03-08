import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton for login/register forms. Compact form layout (title, inputs, button). */
export function AuthFormSkeleton() {
  return (
    <div className="w-full max-w-sm space-y-4">
      <Skeleton className="h-10 w-3/4 rounded-input" aria-hidden />
      <div>
        <Skeleton className="mb-2 h-4 w-14 rounded-input" aria-hidden />
        <Skeleton className="h-10 w-full rounded-input" aria-hidden />
      </div>
      <div>
        <Skeleton className="mb-2 h-4 w-20 rounded-input" aria-hidden />
        <Skeleton className="h-10 w-full rounded-input" aria-hidden />
      </div>
      <Skeleton className="h-10 w-full rounded-input" aria-hidden />
    </div>
  );
}
