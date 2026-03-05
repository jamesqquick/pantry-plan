import { Skeleton } from "@/components/ui/skeleton";

/** Skeleton for the orders list only (title and add button render immediately). */
export function OrderListSkeleton() {
  return (
    <ul
        className="divide-y divide-border overflow-hidden rounded-input border border-border bg-card"
        aria-hidden
      >
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <li
            key={i}
            className="flex min-h-14 flex-wrap items-center justify-between gap-2 px-4 py-3"
          >
            <Skeleton className="h-5 w-48 rounded-input" />
            <Skeleton className="h-4 w-24 rounded-input" />
          </li>
        ))}
      </ul>
  );
}
