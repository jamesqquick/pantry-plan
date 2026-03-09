"use client";

import { splitQuantityFromLine } from "@/lib/quantity-aware-text";
import { cn } from "@/lib/utils";

type QuantityAwareTextProps = {
  children: string;
  className?: string;
  quantityClassName?: string;
};

/**
 * Renders a line with the first quantity pattern (e.g. "1 1/2", "1/2") in a
 * styled span so whole number and fraction read clearly (avoids "11/2" look).
 */
export function QuantityAwareText({
  children,
  className,
  quantityClassName,
}: QuantityAwareTextProps) {
  const trimmed = children?.trim() ?? "";
  if (!trimmed) return <span className={className}>—</span>;

  const parts = splitQuantityFromLine(trimmed);
  if (!parts) {
    return <span className={className}>{trimmed}</span>;
  }

  return (
    <span className={className}>
      {parts.before}
      <span
        className={cn(
          "font-variant-numeric tabular-nums tracking-wide",
          quantityClassName
        )}
        data-quantity-part
      >
        {parts.quantity}
      </span>
      {parts.after}
    </span>
  );
}
