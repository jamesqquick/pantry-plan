# Order Default Due Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give new orders a due date seven local calendar days ahead and a default due time of 9:00 AM.

**Architecture:** Keep the behavior local to `OrderForm`. Add a local date formatter that performs calendar arithmetic without UTC conversion, use it only for create-mode initial state, and leave edit-mode values sourced from persisted props.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library.

---

### Task 1: Add and test create-mode due defaults

**Files:**
- Modify: `src/components/orders/OrderForm.tsx:42-62`
- Test: `src/components/orders/OrderForm.test.tsx:18-21, 21-58`

- [ ] **Step 1: Add a clock-controlled default test**

Add this test before the existing submission test. It freezes the local clock, renders a create form, and checks the date and time input values:

```tsx
it("defaults new orders to seven days from today at 9:00 AM", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 28, 12, 0));

  render(<OrderForm mode="create" recipeOptions={[]} />);

  expect(screen.getByLabelText("Due date")).toHaveProperty("value", "2026-11-04");
  expect(screen.getByLabelText(/Time/)).toHaveProperty("value", "09:00");
});
```

Update the test cleanup so fake timers cannot leak into other tests:

```tsx
  cleanup();
  vi.useRealTimers();
});
```

- [ ] **Step 2: Run the new focused test and confirm it fails**

Run: `pnpm test -- src/components/orders/OrderForm.test.tsx`

Expected: the new test fails because the create form currently renders empty due date and time values.

- [ ] **Step 3: Implement local create-mode defaults**

Add this helper beside `defaultOrderName` in `OrderForm.tsx`:

```tsx
function defaultDueDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
```

Use it and the fixed 9:00 AM value only in the create branch of the initial details state:

```tsx
const [details, setDetails] = useState<OrderDetailsFormValues>({
  customerName: isEdit ? props.initialCustomerName : "",
  customerContact: isEdit ? props.initialCustomerContact : "",
  dueDate: isEdit ? props.initialDueDate : defaultDueDate(),
  dueTime: isEdit ? props.initialDueTime : "09:00",
  fulfillmentMethod: isEdit ? props.initialFulfillmentMethod : "PICKUP",
  deliveryAddress: isEdit ? props.initialDeliveryAddress : "",
  status: isEdit ? props.initialStatus : "DRAFT",
});
```

- [ ] **Step 4: Run focused tests and confirm they pass**

Run: `pnpm test -- src/components/orders/OrderForm.test.tsx`

Expected: all `OrderForm` tests pass, including the new default-value test and the existing test that overrides both values before submission.

- [ ] **Step 5: Commit the implementation**

Run:

```bash
git add src/components/orders/OrderForm.tsx src/components/orders/OrderForm.test.tsx
git commit -m "feat(orders): default new order due details"
```

### Task 2: Verify and update the existing PR

**Files:**
- Verify: `src/components/orders/OrderForm.tsx`
- Verify: `src/components/orders/OrderForm.test.tsx`
- Verify: `docs/superpowers/specs/2026-10-28-order-default-due-design.md`
- Verify: `docs/superpowers/plans/2026-10-28-order-default-due.md`

- [ ] **Step 1: Run the complete test suite**

Run: `pnpm test`

Expected: all tests pass.

- [ ] **Step 2: Run the production build**

Run: `pnpm build`

Expected: Astro completes the Cloudflare production build successfully.

- [ ] **Step 3: Inspect the final branch diff**

Run: `git status --short --branch`, `git diff main...HEAD --check`, and `git diff main...HEAD --stat`.

Expected: only the two order form files and the new spec/plan docs are added after the previous PR changes; `.env`, `.dev.vars`, and `.wrangler` remain ignored.

- [ ] **Step 4: Push the updated PR branch**

Run: `git push`

Expected: `origin/fix/order-status-layout` advances with the new implementation commit and PR 109 updates automatically.
