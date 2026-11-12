// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GroceryListResult } from "@/lib/grocery/aggregate";
import { GroceryListDisplay } from "./GroceryListDisplay";

const grocery: GroceryListResult = {
  totals: [{
    groupKey: "sugar:G",
    ingredientId: "sugar",
    name: "Light brown sugar",
    basisUnit: "G",
    basisUnitLabel: "g",
    totalBasisQty: 225,
    estimatedCostCents: 88,
    anyOptional: false,
    preferredDisplayUnit: "AUTO",
    purchaseUnit: null,
    gramsPerCup: null,
    gramsPerEach: null,
    cupsPerEach: null,
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

afterEach(cleanup);

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
const originalShare = Object.getOwnPropertyDescriptor(navigator, "share");

afterEach(() => {
  for (const [key, descriptor] of [["clipboard", originalClipboard], ["share", originalShare]] as const) {
    if (descriptor) Object.defineProperty(navigator, key, descriptor);
    else Reflect.deleteProperty(navigator, key);
  }
});

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

  it("shows a free water row and a known-zero estimated total", () => {
    render(<GroceryListDisplay grocery={{ ...grocery, totals: [{
      ...grocery.totals[0]!, ingredientId: "water", name: "Water", basisUnit: "CUP", basisUnitLabel: "cup",
      totalBasisQty: 1, estimatedCostCents: 0,
    }], totalEstimatedCostCents: 0 }} />);

    expect(screen.getByText("Water")).toBeTruthy();
    expect(screen.getByText("Estimated total")).toBeTruthy();
    expect(screen.getAllByText("$0.00")).toHaveLength(2);
  });

  it("does not show an unknown-only cost as a zero estimated total", () => {
    render(<GroceryListDisplay grocery={{ ...grocery, totals: [{
      ...grocery.totals[0]!, estimatedCostCents: null,
    }], totalEstimatedCostCents: 0 }} />);

    expect(screen.queryByText("Estimated total")).toBeNull();
    expect(screen.queryByText("$0.00")).toBeNull();
  });

  it("hides zero row costs and the estimated total when showCost is false", () => {
    render(<GroceryListDisplay showCost={false} grocery={{ ...grocery, totals: [{
      ...grocery.totals[0]!, estimatedCostCents: 0,
    }], totalEstimatedCostCents: 0 }} />);

    expect(screen.queryByText("Estimated total")).toBeNull();
    expect(screen.queryByText("$0.00")).toBeNull();
  });

  it("normalizes a pound basis and preserves pounds for automatic shopping display", () => {
    render(<GroceryListDisplay grocery={{ ...grocery, totals: [{
      ...grocery.totals[0]!, groupKey: "sugar:G", basisUnit: "G", basisUnitLabel: "g", totalBasisQty: 226.796185, purchaseUnit: "LB",
    }] }} />);
    expect(screen.getByText("0.5 lb")).toBeTruthy();
  });

  it("honors ounces for a volume-based total using saved density", () => {
    render(<GroceryListDisplay grocery={{ ...grocery, totals: [{
      ...grocery.totals[0]!, basisUnit: "CUP", basisUnitLabel: "cup", totalBasisQty: 2,
      gramsPerCup: 200, preferredDisplayUnit: "OZ",
    }] }} />);
    expect(screen.getByText("14.11 oz")).toBeTruthy();
  });

  it("labels a partially priced list as a known-cost subtotal and links the missing price", () => {
    const flour: GroceryListResult["totals"][number] = {
      ...grocery.totals[0]!,
      groupKey: "flour:G",
      ingredientId: "flour",
      name: "Flour",
      estimatedCostCents: null,
    };
    render(<GroceryListDisplay grocery={{
      ...grocery,
      totals: [grocery.totals[0]!, flour],
      issues: {
        ...grocery.issues,
        missingCost: [{
          groupKey: "flour:G",
          ingredientId: "flour",
          name: "Flour",
          reason: "missing-price",
          sources: [{
            recipeIngredientId: "flour-line",
            recipeId: "bread",
            recipeTitle: "Bread",
            displayText: "1 cup flour",
            qty: 1,
            unit: "CUP",
            batches: 1,
            basisQty: 1,
          }],
        }],
      },
    }} />);

    expect(screen.getByText("Known-cost subtotal")).toBeTruthy();
    expect(screen.getAllByText("$0.88")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Flour" }).getAttribute("href")).toBe("/ingredients/flour");
    expect(screen.getByText(/Add a price to estimate cost\./)).toBeTruthy();
  });

  it("labels unknown-only quantities unavailable without showing a numeric zero", () => {
    render(<GroceryListDisplay grocery={{
      ...grocery,
      totals: [{ ...grocery.totals[0]!, estimatedCostCents: null }],
      issues: {
        ...grocery.issues,
        missingCost: [{
          groupKey: "sugar:G",
          ingredientId: "sugar",
          name: "Light brown sugar",
          reason: "missing-price",
          sources: [],
        }],
      },
      totalEstimatedCostCents: null,
    }} />);

    expect(screen.getByText("Cost estimate unavailable")).toBeTruthy();
    expect(screen.queryByText("Estimated total")).toBeNull();
    expect(screen.queryByText("$0.00")).toBeNull();
  });

  it("labels a known-zero subtotal when another quantity has unknown cost", () => {
    render(<GroceryListDisplay grocery={{
      ...grocery,
      totals: [
        { ...grocery.totals[0]!, groupKey: "water:CUP", ingredientId: "water", name: "Water", estimatedCostCents: 0 },
        { ...grocery.totals[0]!, groupKey: "flour:G", ingredientId: "flour", name: "Flour", estimatedCostCents: null },
      ],
      issues: {
        ...grocery.issues,
        missingCost: [{ groupKey: "flour:G", ingredientId: "flour", name: "Flour", reason: "missing-price", sources: [] }],
      },
      totalEstimatedCostCents: 0,
    }} />);

    expect(screen.getByText("Known-cost subtotal")).toBeTruthy();
    expect(screen.getAllByText("$0.00")).toHaveLength(2);
    expect(screen.queryByText("Estimated total")).toBeNull();
  });

  it("keeps a genuinely empty grocery result free of cost labels and repair notices", () => {
    render(<GroceryListDisplay grocery={{
      ...grocery,
      totals: [],
      totalEstimatedCostCents: null,
    }} />);

    expect(screen.getByText(/No ingredients to aggregate/i)).toBeTruthy();
    expect(screen.queryByText("Estimated total")).toBeNull();
    expect(screen.queryByText("Cost estimate unavailable")).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy" })).toBeNull();
  });

  it("renders and copies every quantity group and unresolved recipe line with context", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const countRow: GroceryListResult["totals"][number] = {
      ...grocery.totals[0]!,
      groupKey: "onion:COUNT",
      ingredientId: "onion",
      name: "Onion",
      basisUnit: "COUNT",
      basisUnitLabel: "ea",
      totalBasisQty: 2,
      estimatedCostCents: 20,
      sources: [{
        recipeIngredientId: "onion-count",
        recipeId: "soup",
        recipeTitle: "Soup",
        displayText: "2 onions",
        qty: 2,
        unit: "COUNT",
        batches: 1,
        basisQty: 2,
      }],
    };
    const massRow: GroceryListResult["totals"][number] = {
      ...grocery.totals[0]!,
      groupKey: "onion:G",
      ingredientId: "onion",
      name: "Onion",
      basisUnit: "G",
      basisUnitLabel: "g",
      totalBasisQty: 200,
      estimatedCostCents: 30,
      sources: [{
        recipeIngredientId: "onion-weight",
        recipeId: "stew",
        recipeTitle: "Stew",
        displayText: "200 g onion",
        qty: 200,
        unit: "G",
        batches: 1,
        basisQty: 200,
      }],
    };
    render(<GroceryListDisplay grocery={{
      ...grocery,
      totals: [countRow, massRow],
      totalEstimatedCostCents: 50,
      issues: {
        ...grocery.issues,
        unmapped: [{
          recipeId: "stew",
          recipeTitle: "Stew",
          displayText: "salt to taste",
          quantity: 1,
          unit: "TSP",
          batches: 2,
        }],
        missingQuantityOrUnit: [{
          recipeId: "soup",
          recipeTitle: "Soup",
          displayText: "pepper to taste",
          quantity: null,
          unit: null,
          batches: 0.5,
        }],
        cannotConvert: [{
          kind: "cannot-combine",
          recipeId: "soup",
          recipeTitle: "Soup",
          ingredientId: "onion",
          groupKey: "onion:COUNT",
          displayText: "2 onions",
          quantity: 2,
          unit: "COUNT",
          batches: 1,
          basisUnit: "COUNT",
          reason: "Add weight per item to combine count and mass quantities; kept separate.",
        }],
      },
    }} />);

    expect(screen.getByText(/kept separate/i)).toBeTruthy();
    expect(screen.getByText(/salt to taste/)).toBeTruthy();
    expect(screen.getByText(/pepper to taste/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(writeText).toHaveBeenCalledOnce();
    const copiedText = writeText.mock.calls[0]?.[0] ?? "";
    expect(copiedText).toContain("Onion");
    expect(copiedText).toContain("kept separate");
    expect(copiedText).toContain("Stew");
    expect(copiedText).toContain("salt to taste");
    expect(copiedText).toContain("2× batches");
    expect(copiedText).toContain("pepper to taste");
    expect(copiedText).toContain("1/2× batches");
  });

  it("keeps unresolved entries and copy controls when no quantities were grouped", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<GroceryListDisplay grocery={{
      ...grocery,
      totals: [],
      totalEstimatedCostCents: null,
      issues: {
        ...grocery.issues,
        unmapped: [{
          recipeId: "soup",
          recipeTitle: "Soup",
          displayText: "salt to taste",
          quantity: null,
          unit: null,
          batches: 2,
        }],
      },
    }} />);

    expect(screen.queryByText(/No ingredients to aggregate/i)).toBeNull();
    expect(screen.getByText("Cost estimate unavailable")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText.mock.calls[0]?.[0]).toContain("Soup");
    expect(writeText.mock.calls[0]?.[0]).toContain("salt to taste");
    expect(writeText.mock.calls[0]?.[0]).toContain("2× batches");
  });

  it("uses the share API when available and falls back to copying otherwise", async () => {
    const user = userEvent.setup();
    const share = vi.fn(async (_data: ShareData) => {});
    const writeText = vi.fn(async (_text: string) => {});
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });

    const { unmount } = render(<GroceryListDisplay grocery={grocery} />);
    await user.click(screen.getByRole("button", { name: "Share" }));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({
      title: "Grocery List",
      text: expect.stringContaining("Light brown sugar"),
    }));
    unmount();

    Reflect.deleteProperty(navigator, "share");
    render(<GroceryListDisplay grocery={grocery} />);
    await user.click(screen.getByRole("button", { name: "Share" }));
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0]?.[0]).toContain("Light brown sugar");
  });

  it("hides cost notices when showCost is false but keeps quantity explanations", () => {
    render(<GroceryListDisplay showCost={false} grocery={{
      ...grocery,
      totals: [{ ...grocery.totals[0]!, estimatedCostCents: null }],
      issues: {
        ...grocery.issues,
        missingCost: [{ groupKey: "sugar:G", ingredientId: "sugar", name: "Light brown sugar", reason: "missing-price", sources: [] }],
        cannotConvert: [{
          kind: "cannot-combine",
          recipeId: "bread",
          recipeTitle: "Bread",
          ingredientId: "sugar",
          groupKey: "sugar:G",
          displayText: "1 cup sugar",
          quantity: 1,
          unit: "CUP",
          batches: 1,
          basisUnit: "G",
          reason: "These quantities were kept separate.",
        }, {
          kind: "missing-conversion",
          recipeId: "bread",
          recipeTitle: "Bread",
          ingredientId: "sugar",
          groupKey: "sugar:G",
          displayText: "1 cup sugar",
          quantity: 1,
          unit: "CUP",
          batches: 1,
          basisUnit: "G",
          reason: "Add a volume-to-weight reference to price this amount.",
        }],
      },
      totalEstimatedCostCents: null,
    }} />);

    expect(screen.queryByText("Cost estimate unavailable")).toBeNull();
    expect(screen.queryByText("Add a price to estimate cost.")).toBeNull();
    expect(screen.getByText(/These quantities were kept separate\./)).toBeTruthy();
    expect(screen.queryByText("Add a volume-to-weight reference to price this amount.")).toBeNull();
  });

  it("shows an explanation beside a fallback for an unavailable display preference", () => {
    render(<GroceryListDisplay grocery={{ ...grocery, totals: [{
      ...grocery.totals[0]!,
      basisUnit: "CUP",
      basisUnitLabel: "cup",
      totalBasisQty: 1,
      preferredDisplayUnit: "GRAM",
      gramsPerCup: null,
    }] }} />);

    expect(screen.getByText("1 cup")).toBeTruthy();
    expect(screen.getByText(/volume-to-weight reference/i)).toBeTruthy();
  });
});
