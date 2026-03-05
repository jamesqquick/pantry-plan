/**
 * Display formatting for grocery list quantities (server-safe).
 * Also exports Apple Notes–friendly list formatting (client-safe).
 */
import { formatQuantity } from "@/lib/quantity/quantity";
import type { BasisUnitLabel } from "./canonical";

export type GroceryLine = {
  name: string;
  totalText: string;
  optional?: boolean;
};

/**
 * Format grocery lines as plain text for copy/paste.
 * One ingredient per line; optional marker when applicable.
 */
export function formatGroceryList(lines: GroceryLine[]): string {
  return lines
    .map((line) => {
      const suffix = line.optional ? " (optional)" : "";
      return `${line.name} — ${line.totalText}${suffix}`;
    })
    .join("\n");
}

export function formatBasisQuantity(
  totalBasisQty: number,
  basisUnitLabel: BasisUnitLabel
): string {
  if (basisUnitLabel === "ea") {
    if (Math.abs(totalBasisQty - Math.round(totalBasisQty)) < 1e-6) {
      return String(Math.round(totalBasisQty));
    }
    return formatQuantity(totalBasisQty);
  }
  if (basisUnitLabel === "g") {
    if (totalBasisQty < 1 && totalBasisQty > 0) {
      return formatQuantity(totalBasisQty);
    }
    return String(Math.round(totalBasisQty));
  }
  if (basisUnitLabel === "cup") {
    if (totalBasisQty >= 1 && Math.abs(totalBasisQty - Math.round(totalBasisQty)) < 1e-6) {
      return String(Math.round(totalBasisQty));
    }
    return formatQuantity(totalBasisQty);
  }
  return formatQuantity(totalBasisQty);
}

export function formatBasisUnitLabel(label: BasisUnitLabel): string {
  switch (label) {
    case "g":
      return "g";
    case "cup":
      return "cup";
    case "ea":
      return "ea";
    default:
      return String(label);
  }
}
