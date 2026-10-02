import { cn } from "@/lib/utils";
import { formatTagName } from "@/lib/tags";
import { Badge } from "./Badge";

export type TagBadgeSize = "sm" | "default";

export interface TagBadgeProps {
  name: string;
  size?: TagBadgeSize;
  className?: string;
}

const sizes = {
  sm: "px-2.5 py-1 text-[0.72rem] leading-none",
  default: "px-3 py-1 text-xs",
} as const;

/** Display-only tag pill (recipe detail, recipe cards). */
export function TagBadge({ name, size = "default", className }: TagBadgeProps) {
  return (
    <Badge
      className={cn(
        "inline-flex items-center rounded-full bg-tag font-ui font-semibold text-tag-foreground",
        sizes[size],
        className,
      )}
    >
      {formatTagName(name)}
    </Badge>
  );
}
