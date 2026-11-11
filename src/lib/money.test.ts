import { describe, expect, it } from "vitest";
import { centsToDollarsInput, dollarsInputToCents, formatDollars } from "./money";

describe("dollarsInputToCents", () => {
  it.each([
    ["0", 0],
    ["20", 2000],
    ["20.50", 2050],
    [".29", 29],
    [" 1.2 ", 120],
    ["70368744177664.01", 7036874417766401],
    ["90071992547409.91", Number.MAX_SAFE_INTEGER],
  ])("parses %s without losing cents", (input, cents) => {
    expect(dollarsInputToCents(input)).toBe(cents);
  });

  it.each(["", ".", "-1", "20.001", "Infinity", "2e1", "90071992547409.92"])("rejects %s", (input) => {
    expect(dollarsInputToCents(input)).toBeNull();
  });
});

describe("integer-cent formatting", () => {
  it.each([
    [0, "0", "$0.00"],
    [1, "0.01", "$0.01"],
    [120, "1.2", "$1.20"],
    [2000, "20", "$20.00"],
    [-1, "-0.01", "-$0.01"],
    [7036874417766401, "70368744177664.01", "$70,368,744,177,664.01"],
    [9007199254740990, "90071992547409.9", "$90,071,992,547,409.90"],
    [Number.MAX_SAFE_INTEGER, "90071992547409.91", "$90,071,992,547,409.91"],
  ])("preserves every cent of %s in inputs and display", (cents, input, formatted) => {
    expect(centsToDollarsInput(cents)).toBe(input);
    expect(formatDollars(cents)).toBe(formatted);
  });
});
