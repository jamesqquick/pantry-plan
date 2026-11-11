import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("astro:actions", async () => {
  const { ActionError } = await import("../../node_modules/astro/dist/actions/runtime/client.js");
  return { ActionError };
});

import { ActionError } from "astro:actions";
import { withSafeActionError } from "./action-error";

afterEach(() => vi.restoreAllMocks());

describe("withSafeActionError", () => {
  it("replaces unexpected internal failures with a safe message", async () => {
    const databaseError = new Error("D1_ERROR: failed query");
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(withSafeActionError("orders.create", "Couldn't save the order.", async () => {
      throw databaseError;
    })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Couldn't save the order.",
    });
    expect(console.error).toHaveBeenCalledWith("Unexpected error in orders.create", databaseError);
  });

  it("preserves actionable Astro action errors", async () => {
    const conflict = new ActionError({ code: "BAD_REQUEST", message: "Invalid order items." });

    await expect(withSafeActionError("orders.create", "Couldn't save the order.", async () => {
      throw conflict;
    })).rejects.toBe(conflict);
  });

  it("sanitizes internal Astro action errors too", async () => {
    const internal = new ActionError({
      code: "INTERNAL_SERVER_ERROR",
      message: "SQLITE_ERROR: failed query",
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(withSafeActionError("orders.update", "Couldn't save the order.", async () => {
      throw internal;
    })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Couldn't save the order.",
    });
  });
});
