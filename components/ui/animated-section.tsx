"use client";

import { cn } from "@/lib/utils";

const DURATION_MS = 300;

/**
 * Wraps content and animates height + opacity when toggling visibility.
 * Use for sections that should fade out and collapse (e.g. cooking mode).
 */
export function AnimatedSection({
  show,
  children,
  className,
}: {
  show: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows,opacity] ease-in-out",
        show ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        className
      )}
      style={{ transitionDuration: `${DURATION_MS}ms` }}
      aria-hidden={!show}
    >
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
