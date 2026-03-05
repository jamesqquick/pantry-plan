"use client";

import { cn } from "@/lib/utils";

type DividerProps = React.ComponentPropsWithoutRef<"hr">;

/**
 * Horizontal rule using bg-divider. Tokens only.
 */
export function Divider({ className, ...props }: DividerProps) {
  return (
    <hr
      className={cn("h-px border-0 bg-divider", className)}
      {...props}
    />
  );
}
