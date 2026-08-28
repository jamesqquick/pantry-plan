import { describe, expect, it } from "vitest";
import { toggleCheckedItem } from "./cook-mode-state";

describe("cook mode state", () => {
  it("checks and unchecks an item without mutating the current set", () => {
    const current = new Set([1]);

    const checked = toggleCheckedItem(current, 2);
    const unchecked = toggleCheckedItem(checked, 1);

    expect(current).toEqual(new Set([1]));
    expect(checked).toEqual(new Set([1, 2]));
    expect(unchecked).toEqual(new Set([2]));
  });
});
