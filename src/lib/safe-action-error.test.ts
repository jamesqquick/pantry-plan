import { describe, expect, it } from "vitest";
import { getSafeActionErrorMessage } from "./safe-action-error";

describe("getSafeActionErrorMessage", () => {
  it("uses a fallback for internal errors that may contain database details", () => {
    expect(getSafeActionErrorMessage({
      code: "INTERNAL_SERVER_ERROR",
      message: "SQLITE_ERROR: failed query",
    }, "Couldn't save the order.")).toBe("Couldn't save the order.");
  });

  it("preserves safe, actionable action messages", () => {
    expect(getSafeActionErrorMessage({
      code: "CONFLICT",
      message: "One or more recipes not found or not yours.",
    }, "Couldn't save the order.")).toBe("One or more recipes not found or not yours.");
  });

  it("uses a fallback when an error has no recognized code", () => {
    expect(getSafeActionErrorMessage({ message: "D1_ERROR: failed query" }, "Couldn't save the order."))
      .toBe("Couldn't save the order.");
  });
});
