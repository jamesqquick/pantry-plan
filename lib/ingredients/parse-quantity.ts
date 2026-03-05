import { normalizeFractionText, parseQuantityText } from "./fractions";

const QUANTITY_PREFIX =
  /^(\d+\s+\d+\s*\/\s*\d+|\d+\s*\/\s*\d+|\d+\.?\d*)\s*/;

export type QuantityPrefixResult = {
  quantityText: string | null;
  quantity: number | null;
  remainder: string;
};

export function parseQuantityPrefix(line: string): QuantityPrefixResult {
  const normalized = normalizeFractionText(line.trim());
  const qtyMatch = normalized.match(QUANTITY_PREFIX);
  if (qtyMatch) {
    const token = qtyMatch[1].trim();
    return {
      quantityText: token,
      quantity: parseQuantityText(token),
      remainder: normalized.slice(qtyMatch[0].length).trim(),
    };
  }
  return { quantityText: null, quantity: null, remainder: normalized };
}
