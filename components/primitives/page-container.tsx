"use client";

import { cn } from "@/lib/utils";

type PageContainerProps = React.ComponentPropsWithoutRef<"div"> & {
  /** Max width class; default max-w-5xl */
  maxWidth?: "max-w-4xl" | "max-w-5xl" | "max-w-6xl";
};

/**
 * Consistent page width and padding. Uses 8pt scale (px-4 py-6).
 */
export function PageContainer({
  className,
  maxWidth = "max-w-5xl",
  ...props
}: PageContainerProps) {
  return (
    <div
      className={cn("mx-auto w-full px-4 py-6", maxWidth, className)}
      {...props}
    />
  );
}
