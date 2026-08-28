import { describe, expect, it } from "vitest";
import { getCheckedProgress, toggleCheckedItem } from "./cook-mode-state";

describe("cook mode state", () => {
  it("checks and unchecks an item without mutating the current set", () => {
    const current = new Set([1]);

    const checked = toggleCheckedItem(current, 2);
    const unchecked = toggleCheckedItem(checked, 1);

    expect(current).toEqual(new Set([1]));
    expect(checked).toEqual(new Set([1, 2]));
    expect(unchecked).toEqual(new Set([2]));
  });

  it("formats checked progress against the available items", () => {
    expect(getCheckedProgress(new Set([0, 2]), 4)).toBe("2 of 4");
    expect(getCheckedProgress(new Set(), 0)).toBe("0 of 0");
  });
});
