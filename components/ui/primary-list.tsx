import Link from "next/link";
import { cn } from "@/lib/cn";

export type PrimaryListItem = {
  id: string;
  primaryText: string;
  badge?: string | null;
  secondaryText?: string | null;
  href?: string | null;
};

type PrimaryListProps = {
  items: PrimaryListItem[];
  className?: string;
  listClassName?: string;
  "aria-label"?: string;
};

export function PrimaryList({
  items,
  className,
  listClassName,
  "aria-label": ariaLabel,
}: PrimaryListProps) {
  if (items.length === 0) return null;

  return (
    <ul
      className={cn(
        "divide-y divide-border overflow-hidden rounded-input border border-border bg-card",
        listClassName
      )}
      aria-label={ariaLabel}
    >
      {items.map((item) => {
        const content = (
          <>
            <span className="flex items-center gap-2 font-medium">
              {item.primaryText}
              {item.badge != null && item.badge !== "" && (
                <span
                  className="rounded-full bg-accent px-2 py-0.5 text-xs font-normal text-accent-foreground"
                  aria-hidden
                >
                  {item.badge}
                </span>
              )}
            </span>
            {item.secondaryText != null && item.secondaryText !== "" && (
              <span className="text-sm text-muted-foreground">
                {item.secondaryText}
              </span>
            )}
          </>
        );

        const rowClassName =
          "flex min-h-14 flex-wrap items-center justify-between gap-2 px-4 py-3 text-foreground";

        if (item.href?.trim()) {
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                className={cn(rowClassName, "hover:bg-muted")}
              >
                {content}
              </Link>
            </li>
          );
        }

        return (
          <li key={item.id}>
            <div className={rowClassName}>{content}</div>
          </li>
        );
      })}
    </ul>
  );
}
