# Order Default Due Date Design

## Goal

New orders should start with a due date seven calendar days from the current
local date and a due time of 9:00 AM.

## Design

- Add local date-default helpers in `OrderForm.tsx` beside the existing order
  name default helper.
- Calculate the due date using local calendar operations, then format it as
  `YYYY-MM-DD` for the date input.
- Use `09:00` for the default time input value.
- Apply both defaults only when `OrderForm` is in create mode.
- Continue using `initialDueDate` and `initialDueTime` unchanged in edit mode.
- Do not change the database schema, server actions, or persisted order data.

## Testing

- Freeze the system clock in an `OrderForm` test.
- Render a create form and assert the date and time inputs contain the expected
  seven-day and `09:00` defaults.
- Preserve the existing submission test to verify users can override both
  defaults and those explicit values are submitted.
- Run the focused order form tests, the full test suite, and the production
  build.
