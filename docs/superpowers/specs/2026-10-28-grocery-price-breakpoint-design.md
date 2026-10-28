# Grocery Price Breakpoint Design

## Goal

Keep grocery prices stacked only on small screens, while keeping them in a
right-aligned column on medium and larger screens.

## Design

- Change the grocery item grid from a single column below `md` to a single
  column below `sm`.
- Change the price text alignment from left below `md` to left only below
  `sm`, with right alignment at `sm` and above.
- Keep `shrink-0` and `whitespace-nowrap` so prices never break.
- Update the existing regression assertion to verify the `sm` breakpoint.

## Testing

- Run the focused grocery list test.
- Run the full test suite and production build.
- Push the updated branch to PR 109.
