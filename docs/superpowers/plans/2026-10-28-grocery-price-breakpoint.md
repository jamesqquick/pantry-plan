# Grocery Price Breakpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stack grocery prices only below the `sm` breakpoint and keep them beside ingredient details at `sm` and above.

**Architecture:** Update the existing grocery list grid and price alignment utility classes from `md` to `sm`. Update the focused regression test to assert the new breakpoint; no component or data changes are needed.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vitest, Testing Library.

---

### Task 1: Move the grocery price breakpoint to `sm`

**Files:**
- Modify: `src/components/orders/GroceryListDisplay.tsx:164-180`
- Modify: `src/components/orders/GroceryListDisplay.test.tsx:30-41`

- [ ] **Step 1: Update the regression assertion first**

Change the list item assertion from the current `md` grid class to the `sm` grid class:

```tsx
expect(item?.className).toContain("sm:grid-cols-[minmax(0,1fr)_auto]");
```

Change the test description to:

```tsx
it("keeps item prices unbroken and stacks them below details on small screens", () => {
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `pnpm test -- src/components/orders/GroceryListDisplay.test.tsx`

Expected: the test fails because the component still uses `md:grid-cols-[minmax(0,1fr)_auto]`.

- [ ] **Step 3: Update the component breakpoints**

Change the list item and price classes to:

```tsx
<li
  key={row.ingredientId}
  className="grid grid-cols-1 items-start gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto]"
>
```

```tsx
<span className="shrink-0 whitespace-nowrap text-left text-meta tabular-nums text-muted-foreground sm:text-right">
```

This keeps the price stacked below the ingredient and measurement below `sm`,
and restores the right-aligned second column at `sm` and larger widths.

- [ ] **Step 4: Run the focused test and confirm it passes**

Run: `pnpm test -- src/components/orders/GroceryListDisplay.test.tsx`

Expected: the focused test passes.

- [ ] **Step 5: Commit the breakpoint adjustment**

Run:

```bash
git add src/components/orders/GroceryListDisplay.tsx src/components/orders/GroceryListDisplay.test.tsx
git commit -m "fix(orders): adjust grocery price breakpoint"
```

### Task 2: Verify and update PR 109

**Files:**
- Verify: `src/components/orders/GroceryListDisplay.tsx`
- Verify: `src/components/orders/GroceryListDisplay.test.tsx`
- Verify: `docs/superpowers/specs/2026-10-28-grocery-price-breakpoint-design.md`
- Verify: `docs/superpowers/plans/2026-10-28-grocery-price-breakpoint.md`

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`

Expected: all tests pass.

- [ ] **Step 2: Run the production build**

Run: `pnpm build`

Expected: Astro completes the Cloudflare production build successfully.

- [ ] **Step 3: Inspect the final diff**

Run: `git status --short --branch`, `git diff --check`, and `git diff main...HEAD --stat`.

Expected: the worktree is clean and only the breakpoint spec/plan, component, and test are added beyond the existing PR changes.

- [ ] **Step 4: Push the updated PR branch**

Run: `git push`

Expected: PR 109 updates with the `sm` breakpoint behavior.
