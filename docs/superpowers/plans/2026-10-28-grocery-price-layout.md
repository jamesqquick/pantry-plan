# Grocery Price Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent grocery item prices from breaking vertically while moving them below the ingredient details on smaller screens.

**Architecture:** Keep the grocery list item as a CSS grid. Use a single column below `md` and restore the existing ingredient-plus-price columns at `md` and above. Make only the price span non-shrinking and non-wrapping.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vitest, Testing Library.

---

### Task 1: Cover the responsive grocery price layout

**Files:**
- Create: `src/components/orders/GroceryListDisplay.test.tsx`
- Test: `src/components/orders/GroceryListDisplay.test.tsx`

- [ ] **Step 1: Add a focused rendering test**

Create a jsdom test with one priced grocery row and assert the price classes and responsive list-item classes:

```tsx
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
    expect(item?.className).toContain("md:grid-cols-[minmax(0,1fr)_auto]");
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `pnpm test -- src/components/orders/GroceryListDisplay.test.tsx`

Expected: the test fails because the current price span uses `[overflow-wrap:anywhere]` and the list item has only the two-column grid class.

### Task 2: Implement the responsive no-wrap price layout

**Files:**
- Modify: `src/components/orders/GroceryListDisplay.tsx:164-180`

- [ ] **Step 1: Update the grocery item grid classes**

Change the list item from the always-two-column grid:

```tsx
className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 px-4 py-3"
```

to a stacked-small-screen and two-column-large-screen grid:

```tsx
className="grid grid-cols-1 items-start gap-x-4 gap-y-1 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto]"
```

- [ ] **Step 2: Make the price non-shrinking and non-wrapping**

Replace the current price span class:

```tsx
className="max-w-[40%] min-w-0 text-right text-meta tabular-nums text-muted-foreground [overflow-wrap:anywhere]"
```

with:

```tsx
className="shrink-0 whitespace-nowrap text-left text-meta tabular-nums text-muted-foreground md:text-right"
```

This keeps the price below the ingredient details on smaller screens and right-aligns it in the auto-sized second column at `md` and above.

- [ ] **Step 3: Run the focused test and confirm it passes**

Run: `pnpm test -- src/components/orders/GroceryListDisplay.test.tsx`

Expected: the no-wrap and responsive class assertions pass.

- [ ] **Step 4: Commit the implementation**

Run:

```bash
git add src/components/orders/GroceryListDisplay.tsx src/components/orders/GroceryListDisplay.test.tsx
git commit -m "fix(orders): keep grocery prices readable"
```

### Task 3: Verify and update PR 109

**Files:**
- Verify: `src/components/orders/GroceryListDisplay.tsx`
- Verify: `src/components/orders/GroceryListDisplay.test.tsx`
- Verify: `docs/superpowers/specs/2026-10-28-grocery-price-layout-design.md`
- Verify: `docs/superpowers/plans/2026-10-28-grocery-price-layout.md`

- [ ] **Step 1: Run the complete test suite**

Run: `pnpm test`

Expected: all tests pass.

- [ ] **Step 2: Run the production build**

Run: `pnpm build`

Expected: Astro completes the Cloudflare production build successfully.

- [ ] **Step 3: Inspect the final diff**

Run: `git status --short --branch`, `git diff --check`, and `git diff main...HEAD --stat`.

Expected: the worktree is clean and the diff contains only the new grocery price spec/plan, implementation, and test in addition to the existing PR changes.

- [ ] **Step 4: Push the updated PR branch**

Run: `git push`

Expected: PR 109 updates with the grocery price layout fix.
