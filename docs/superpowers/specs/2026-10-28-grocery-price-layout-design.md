# Grocery Price Layout Design

## Goal

Keep grocery list item prices readable and unbroken on the order details page.

## Design

- Use a single-column grid for grocery list items below the `md` breakpoint so
  the price appears below the ingredient name and measurement.
- Use the existing two-column layout at `md` and above, with the price in a
  right-aligned auto-sized column.
- Apply `whitespace-nowrap` and `shrink-0` to each price so currency text never
  breaks into separate characters.
- Preserve the existing ingredient name, measurement, colors, spacing, and
  cost formatting.

## Testing

- Add or update component coverage for the price element's no-wrap behavior and
  responsive grid classes if the existing test setup supports class assertions.
- Run the focused grocery/order component tests, the full test suite, and the
  production build.
