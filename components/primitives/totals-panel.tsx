"use client";

import { cn } from "@/lib/utils";

type TotalsPanelProps = {
  title?: string;
  items?: { label: string; value: string }[];
  className?: string;
};

/**
 * Summary/totals block using bg-panel. Tokens only; 8pt spacing.
 */
export function TotalsPanel({
  title = "Totals",
  items = [],
  className,
}: TotalsPanelProps) {
  return (
    <section
      className={cn(
        "rounded-lg border border-border bg-panel p-4 text-panel-foreground",
        className
      )}
    >
      <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
      <ul className="mt-2 space-y-1.5">
        {items.map(({ label, value }) => (
          <li key={label} className="flex justify-between text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium">{value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
