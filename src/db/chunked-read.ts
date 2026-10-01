import { MAX_PARAMS_PER_STATEMENT } from "./chunked-insert";

export function chunkInValues<T>(
  values: readonly T[],
  reservedParams = 0,
): T[][] {
  if (
    !Number.isInteger(reservedParams) ||
    reservedParams < 0 ||
    reservedParams >= MAX_PARAMS_PER_STATEMENT
  ) {
    throw new RangeError(
      `reservedParams must be between 0 and ${MAX_PARAMS_PER_STATEMENT - 1}`,
    );
  }

  const chunkSize = MAX_PARAMS_PER_STATEMENT - reservedParams;
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}
