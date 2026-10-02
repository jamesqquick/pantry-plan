import { describe, expect, it } from "vitest";
import { MAX_PARAMS_PER_STATEMENT } from "./chunked-insert";
import { chunkInValues } from "./chunked-read";

describe("chunkInValues", () => {
  it("chunks 200 IN values while reserving a bound parameter", () => {
    const values = Array.from({ length: 200 }, (_, index) => index);
    const chunks = chunkInValues(values, 1);

    expect(chunks.map((chunk) => chunk.length)).toEqual([89, 89, 22]);
    expect(chunks.flat()).toEqual(values);
    expect(
      chunks.every(
        (chunk) => chunk.length + 1 <= MAX_PARAMS_PER_STATEMENT,
      ),
    ).toBe(true);
  });

  it("returns no chunks for an empty value list", () => {
    expect(chunkInValues([], 1)).toEqual([]);
  });

  it.each([-1, 1.5, MAX_PARAMS_PER_STATEMENT])(
    "rejects invalid reserved parameter count %s",
    (reservedParams) => {
      expect(() => chunkInValues(["value"], reservedParams)).toThrow(
        RangeError,
      );
    },
  );
});
