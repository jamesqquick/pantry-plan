# Order Status Layout Design

## Goal

Update the order details page so Order Status uses the same visual structure as
the Customer and Fulfillment sections.

## Design

- Move Order Status into the existing top information grid as its third section.
- Use the shared `font-display text-xl text-foreground` heading treatment for
  the `Order Status` heading.
- Remove the status section's surrounding card/aside border and background.
- Remove the status badge.
- Remove all text rendered below the status dropdown, including helper,
  saving, success, and error messages.
- Keep status persistence and rollback behavior unchanged internally. A failed
  request must still restore the previous selected value and allow another
  selection.
- Keep the select disabled while a save request is in flight.

## Responsive Layout

The information area remains a single column on narrow screens. At the
existing wider breakpoint, Customer, Fulfillment, and Order Status appear as
three peer sections in one grid.

## Components

`src/pages/orders/[id]/index.astro` owns the information-section layout and
renders the Order Status heading around the client-loaded selector.

`src/components/orders/OrderStatusSelect.tsx` owns status selection and the
update action, but renders only the select control. Its state continues to
handle optimistic updates, rollback, loading, and retry behavior without
exposing status text in the page.

## Validation

- Update `OrderStatusSelect` tests to cover successful persistence and rollback
  without expecting visible feedback text.
- Run the focused order status tests.
- Run the complete test suite and production build.
- Confirm the diff excludes the existing untracked mockup files.
