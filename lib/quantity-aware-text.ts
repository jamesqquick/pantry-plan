/**
 * Detect first quantity pattern in a line (mixed "1 1/2" or fraction "1/2")
 * for display styling. Client-safe; no server-only imports.
 */

/** Regex: mixed number (e.g. "1 1/2") or fraction only (e.g. "1/2"). */
const QUANTITY_PATTERN = /(\d+\s+\d+\/\d+|\d+\/\d+)/;

export type QuantityPart = {
  before: string;
  quantity: string;
  after: string;
};

/**
 * Split a string at the first quantity pattern. If no match, returns null.
 */
export function splitQuantityFromLine(line: string): QuantityPart | null {
  const m = line.match(QUANTITY_PATTERN);
  if (!m) return null;
  const quantity = m[1];
  const idx = line.indexOf(quantity);
  return {
    before: line.slice(0, idx),
    quantity,
    after: line.slice(idx + quantity.length),
  };
}
