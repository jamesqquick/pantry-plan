import { describe, expect, it, vi } from "vitest";
import { getActionErrorMessage, runActionWithRecovery } from "./action-error";

describe("getActionErrorMessage", () => {
  it("returns null when the action succeeds", async () => {
    await expect(
      getActionErrorMessage(async () => ({ error: undefined }), "Fallback"),
    ).resolves.toBeNull();
  });

  it("returns an action error message", async () => {
    await expect(
      getActionErrorMessage(
        async () => ({ error: { message: "Request failed" } }),
        "Fallback",
      ),
    ).resolves.toBe("Request failed");
  });

  it("uses the fallback when an action error has no message", async () => {
    await expect(
      getActionErrorMessage(async () => ({ error: {} }), "Fallback"),
    ).resolves.toBe("Fallback");
  });

  it("returns a thrown error message", async () => {
    await expect(
      getActionErrorMessage(async () => {
        throw new Error("Network unavailable");
      }, "Fallback"),
    ).resolves.toBe("Network unavailable");
  });

  it("uses the fallback for non-Error rejections", async () => {
    await expect(
      getActionErrorMessage(async () => {
        throw "Network unavailable";
      }, "Fallback"),
    ).resolves.toBe("Fallback");
  });
});

describe("runActionWithRecovery", () => {
  it("runs success and cleanup callbacks when the action succeeds", async () => {
    const onError = vi.fn();
    const onSuccess = vi.fn();
    const onSettled = vi.fn();

    await runActionWithRecovery({
      action: async () => ({ error: undefined }),
      fallback: "Fallback",
      onError,
      onSuccess,
      onSettled,
    });

    expect(onSuccess).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledOnce();
  });

  it.each([
    {
      name: "returned errors",
      action: async () => ({ error: { message: "Action failed" } }),
      expected: "Action failed",
    },
    {
      name: "rejected requests",
      action: async () => {
        throw new TypeError("Network unavailable");
      },
      expected: "Network unavailable",
    },
  ])("reports $name and always runs cleanup", async ({ action, expected }) => {
    const onError = vi.fn();
    const onSuccess = vi.fn();
    const onSettled = vi.fn();

    await runActionWithRecovery({
      action,
      fallback: "Fallback",
      onError,
      onSuccess,
      onSettled,
    });

    expect(onError).toHaveBeenCalledWith(expected);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledOnce();
  });
});
