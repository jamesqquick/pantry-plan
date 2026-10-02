import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type TagToggleSize = "sm" | "default";

export interface TagToggleProps {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  /** Optional count shown after the label (e.g. recipes with this tag). */
  count?: number;
  size?: TagToggleSize;
  className?: string;
}

const sizes = {
  sm: "gap-1.5 px-3 py-1.5 text-xs",
  default: "gap-1.5 px-3.5 py-2 text-[0.85rem]",
} as const;

/**
 * Toggleable filter/tag chip. Outlined pill at rest; selected state fills
 * with the foreground ink so it reads as "on" in both themes.
 */
export function TagToggle({
  selected,
  onClick,
  children,
  count,
  size = "sm",
  className,
}: TagToggleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "inline-flex cursor-pointer items-center rounded-full border-[1.5px] font-ui font-semibold leading-none transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        sizes[size],
        selected
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-transparent text-foreground hover:border-outline-strong",
        className,
      )}
    >
      {children}
      {count != null && (
        <small
          className={cn(
            "text-[0.75rem] font-semibold tabular-nums",
            selected ? "text-background/75" : "text-muted-foreground",
          )}
        >
          {count}
        </small>
      )}
    </button>
  );
}
