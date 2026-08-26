import { describe, expect, it } from "vitest";
import { getGoogleAuthErrorMessage } from "./auth-errors";

describe("getGoogleAuthErrorMessage", () => {
  it("explains how to link an existing password account", () => {
    expect(getGoogleAuthErrorMessage("account_not_linked")).toContain(
      "connect Google from Profile",
    );
  });

  it("does not expose provider error details", () => {
    expect(getGoogleAuthErrorMessage("provider_error")).toBe(
      "Google sign-in was not completed. Please try again.",
    );
  });

  it("returns no message when there is no error", () => {
    expect(getGoogleAuthErrorMessage(null)).toBeNull();
  });
});
