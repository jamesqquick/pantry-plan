import { describe, expect, it } from "vitest";
import { getSafeActionErrorMessage } from "./safe-action-error";

describe("getSafeActionErrorMessage", () => {
  it("uses a fallback for internal errors that may contain database details", () => {
    expect(getSafeActionErrorMessage({
      code: "INTERNAL_SERVER_ERROR",
      message: "SQLITE_ERROR: no such table: MutationOperation",
    }, "Couldn't save the order.")).toBe("Couldn't save the order.");
  });

  it("preserves safe, actionable action messages", () => {
    expect(getSafeActionErrorMessage({
      code: "CONFLICT",
      message: "This submission was cancelled. Start a new submission.",
    }, "Couldn't save the order.")).toBe("This submission was cancelled. Start a new submission.");
  });

  it("uses a fallback when an error has no recognized code", () => {
    expect(getSafeActionErrorMessage({ message: "D1_ERROR: failed query" }, "Couldn't save the order."))
      .toBe("Couldn't save the order.");
  });
});
