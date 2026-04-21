import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export interface TagToggleProps {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}

/**
 * Toggleable tag pill. Active state uses the primary color;
 * inactive uses the badge palette (primary-icon-bg / primary-icon-fg)
 * so it matches the TagBadge display style.
 */
export function TagToggle({
  selected,
  onClick,
  children,
  className,
}: TagToggleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-colors",
        selected
          ? "bg-primary text-primary-foreground"
          :           "bg-primary-icon-bg text-primary-icon-fg hover:bg-primary hover:text-primary-foreground",
        className,
      )}
    >
      {children}
    </button>
  );
}
