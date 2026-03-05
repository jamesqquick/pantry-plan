import type { ParsedLine } from "./parse-ingredient-line";

export function scaleParsedLines(
  lines: ParsedLine[],
  batches: number
): ParsedLine[] {
  if (batches <= 0) return lines;
  if (batches === 1) return lines;
  return lines.map((line) => ({
    ...line,
    qty: line.qty != null ? line.qty * batches : undefined,
  }));
}
