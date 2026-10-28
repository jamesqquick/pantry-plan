# Order Status Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present Order Status as the third unboxed information section on the order details page without badges or text beneath the dropdown.

**Architecture:** Keep status persistence in `OrderStatusSelect`, but reduce that component to the select control and internal optimistic-update state. Move the section heading and layout responsibility to the order details Astro page beside Customer and Fulfillment.

**Tech Stack:** Astro 7, React 19, TypeScript, Tailwind CSS, Vitest, Testing Library.

---

### Task 1: Remove status presentation feedback

**Files:**
- Modify: `src/components/orders/OrderStatusSelect.tsx:1-88`
- Test: `src/components/orders/OrderStatusSelect.test.tsx:20-67`

- [ ] **Step 1: Update the component contract and state**

Remove the `OrderStatusBadge` import, `STATUS_HELP`, `error`, and `message` state. Keep `status` and `saving`, and keep the previous-status rollback in `updateStatus`:

```tsx
const [status, setStatus] = useState(initialStatus);
const [saving, setSaving] = useState(false);

async function updateStatus(value: string) {
  const nextStatus = value as OrderStatus;
  const previousStatus = status;
  setStatus(nextStatus);
  setSaving(true);

  try {
    const { error: actionError } = await actions.orders.updateStatus({
      id: orderId,
      status: nextStatus,
    });
    if (actionError) setStatus(previousStatus);
  } catch {
    setStatus(previousStatus);
  } finally {
    setSaving(false);
  }
}
```

- [ ] **Step 2: Render only the select control**

Replace the wrapper, label/badge row, feedback paragraph, and `aria-describedby` with a select that retains the existing ID, accessible name, options, optimistic value, change handler, disabled state, and focus styling:

```tsx
return (
  <select
    id={statusId}
    aria-label="Order status"
    value={status}
    onChange={(event) => void updateStatus(event.target.value)}
    disabled={saving}
    className="flex h-10 w-full cursor-pointer rounded-input border border-input bg-card px-3 py-1.5 font-ui text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
  >
    {ORDER_STATUSES.map((option) => (
      <option key={option} value={option}>
        {ORDER_STATUS_LABELS[option]}
      </option>
    ))}
  </select>
);
```

- [ ] **Step 3: Update tests for silent success and rollback**

Keep the successful-save assertion for `actions.orders.updateStatus`, then assert the selected value changes and no old feedback text is rendered. In the action-error test, wait for the select to return to `DRAFT` and assert there is no alert. In the thrown-request test, assert rollback to `CONFIRMED`, select `READY` again, and assert the second request succeeds and the value is `READY`; remove all `findByText` and role-feedback assertions.

- [ ] **Step 4: Run the focused test file**

Run: `pnpm test -- src/components/orders/OrderStatusSelect.test.tsx`

Expected: all three `OrderStatusSelect` tests pass.

### Task 2: Make Order Status the third peer section

**Files:**
- Modify: `src/pages/orders/[id]/index.astro:198-249`

- [ ] **Step 1: Replace the two-column-plus-aside layout**

Change the information wrapper to a three-column grid at `md`, remove the nested left grid and `<aside>` card, and keep Customer and Fulfillment as peer sections. The resulting structure should be:

```astro
<section class="grid gap-6 border-b border-border pb-7 md:grid-cols-3 md:items-start">
  <section aria-labelledby="order-customer-heading">
    <h2 id="order-customer-heading" class="font-display text-xl text-foreground">
      Customer
    </h2>
    {o.customerName ? (
      <p class="mt-2 text-sm font-medium text-foreground">{o.customerName}</p>
    ) : (
      <p class="mt-2 text-sm text-muted-foreground">Customer not added</p>
    )}
    {o.customerContact && (
      <p class="mt-1 break-all text-sm text-muted-foreground">{o.customerContact}</p>
    )}
  </section>

  <section aria-labelledby="order-fulfillment-heading">
    <h2 id="order-fulfillment-heading" class="font-display text-xl text-foreground">
      Fulfillment
    </h2>
    <p class="mt-2 text-sm font-medium text-foreground">
      {o.fulfillmentMethod === "DELIVERY" ? "Delivery" : "Pickup"}
    </p>
    {(dueDateLabel || dueTimeLabel) ? (
      <p class="mt-1 text-sm text-muted-foreground">
        {dueDateLabel ?? "Date not set"}{dueTimeLabel && ` at ${dueTimeLabel}`}
      </p>
    ) : (
      <p class="mt-1 text-sm text-muted-foreground">Due date not set</p>
    )}
    {o.fulfillmentMethod === "DELIVERY" && (
      <p class="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
        {o.deliveryAddress || "Address not added"}
      </p>
    )}
  </section>

  <section aria-labelledby="order-status-heading">
    <h2 id="order-status-heading" class="font-display text-xl text-foreground">
      Order Status
    </h2>
    <div class="mt-2">
      <OrderStatusSelect
        client:load
        orderId={o.id}
        initialStatus={o.status}
      />
    </div>
  </section>
</section>
```

Retain all existing Customer and Fulfillment content and the existing `client:load` hydration directive. The status section must not have a border, card background, badge, or helper/error text.

- [ ] **Step 2: Run the page type check/build**

Run: `pnpm build`

Expected: Astro completes the production build without TypeScript or template errors.

### Task 3: Full verification and PR

**Files:**
- Verify only the intended implementation files and the already committed design/plan docs are changed.

- [ ] **Step 1: Run the complete test suite**

Run: `pnpm test`

Expected: all tests pass.

- [ ] **Step 2: Inspect the final diff and worktree**

Run: `git status --short`, `git diff main...HEAD --check`, and `git diff main...HEAD --stat`.

Expected: only the design doc, implementation plan, `OrderStatusSelect` source/test, and order details page are included; `src/components/mockups/` and `src/pages/mockups/` remain untracked and unstaged.

- [ ] **Step 3: Commit implementation changes**

Run:

```bash
git add src/components/orders/OrderStatusSelect.tsx src/components/orders/OrderStatusSelect.test.tsx 'src/pages/orders/[id]/index.astro' docs/superpowers/plans/2026-10-28-order-status-layout.md
git commit -m "fix(orders): simplify order status section"
```

- [ ] **Step 4: Push the feature branch**

Run: `git push -u origin fix/order-status-layout`

- [ ] **Step 5: Open the pull request**

Run:

```bash
gh pr create --base main --head fix/order-status-layout --title "fix(orders): simplify order status section" --body $'## Summary\n- place Order Status beside Customer and Fulfillment\n- match the shared section heading styles\n- remove the status card, badge, and dropdown feedback text\n\n## Verification\n- pnpm test\n- pnpm build'
```

Expected: GitHub returns the new pull request URL.
