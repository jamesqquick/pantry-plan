"use client";

import { cn } from "@/lib/utils";

type CardShellProps = React.ComponentPropsWithoutRef<"div"> & {
  /** Padding: default (p-4) or "lg" (p-6) */
  padding?: "default" | "lg";
};

/**
 * Consistent card surface: border, background, radius. Tokens only.
 * Cards: rounded-lg, border-border, bg-card. Padding 8pt scale.
 */
export function CardShell({
  className,
  padding = "default",
  ...props
}: CardShellProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card text-card-foreground",
        padding === "default" && "p-4",
        padding === "lg" && "p-6",
        className
      )}
      {...props}
    />
  );
}
