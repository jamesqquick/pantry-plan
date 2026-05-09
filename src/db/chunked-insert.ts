/**
 * D1 caps SQL bound parameters per statement (~100 documented, ~999 in
 * practice). Drizzle's bulk insert generates one statement with `rows ×
 * cols` placeholders, which trips the limit on recipes with many ingredients.
 *
 * `chunkRows` splits a row array so each chunk's total placeholder count
 * stays under MAX_PARAMS_PER_STATEMENT. Use the returned chunks to build
 * a series of `db.insert(...).values(chunk)` statements that fit in one
 * batch.
 */

/**
 * Conservative cap. D1's docs say 100; the runtime allows more, but 90
 * leaves headroom and makes statements predictable in size.
 */
export const MAX_PARAMS_PER_STATEMENT = 90;

export function chunkRows<T>(rows: readonly T[], paramsPerRow: number): T[][] {
  if (rows.length === 0) return [];
  if (paramsPerRow <= 0) {
    throw new Error("paramsPerRow must be positive");
  }
  const rowsPerChunk = Math.max(
    1,
    Math.floor(MAX_PARAMS_PER_STATEMENT / paramsPerRow),
  );
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += rowsPerChunk) {
    chunks.push(rows.slice(i, i + rowsPerChunk));
  }
  return chunks;
}
