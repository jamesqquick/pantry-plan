// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GroceryListResult } from "@/lib/grocery/aggregate";
import { GroceryListDisplay } from "./GroceryListDisplay";

const grocery: GroceryListResult = {
  totals: [{
    ingredientId: "sugar",
    name: "Light brown sugar",
    basisUnit: "G",
    basisUnitLabel: "g",
    totalBasisQty: 225,
    estimatedCostCents: 88,
    anyOptional: false,
    preferredDisplayUnit: "AUTO",
    gramsPerCup: null,
    sources: [],
  }],
  issues: {
    unmapped: [],
    missingQuantityOrUnit: [],
    cannotConvert: [],
    missingCost: [],
  },
  totalEstimatedCostCents: 88,
};

describe("GroceryListDisplay", () => {
  it("keeps item prices unbroken and stacks them below details on small screens", () => {
    render(<GroceryListDisplay grocery={grocery} />);

    const price = screen.getAllByText("$0.88")[0]!;
    const item = price.closest("li");

    expect(price.className).toContain("shrink-0");
    expect(price.className).toContain("whitespace-nowrap");
    expect(item?.className).toContain("grid-cols-1");
    expect(item?.className).toContain("sm:grid-cols-[minmax(0,1fr)_auto]");
  });
});
