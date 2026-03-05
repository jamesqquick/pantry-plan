"use client";

import { cn } from "@/lib/utils";

type TotalsPanelProps = {
  title?: string;
  items?: { label: string; value: string }[];
  className?: string;
};

/**
 * Example component demonstrating token usage:
 * bg-panel, text-panel-foreground, border-border, muted headings.
 * Use for totals, summaries, or side panels.
 */
export function TotalsPanel({
  title = "Totals",
  items = [
    { label: "Items", value: "12" },
    { label: "Estimated cost", value: "—" },
  ],
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
          <li
            key={label}
            className="flex justify-between text-sm"
          >
            <span className="text-muted-foreground">{label}</span>
            <span className="font-medium">{value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
