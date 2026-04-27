import { cn } from "@/lib/utils";

export type TagBadgeSize = "sm" | "default";

export interface TagBadgeProps {
  name: string;
  size?: TagBadgeSize;
  className?: string;
}

const sizes = {
  sm: "px-2 py-0.5 text-[10px]",
  default: "px-2.5 py-0.5 text-xs",
} as const;

/**
 * Display-only tag badge. Used on recipe detail, recipe cards, etc.
 * Matches the design-system badge style: primary-icon-bg + primary-icon-fg.
 */
export function TagBadge({ name, size = "default", className }: TagBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-primary-icon-bg font-semibold text-primary-icon-fg",
        sizes[size],
        className,
      )}
    >
      {name}
    </span>
  );
}
