// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PendingCreates } from "./PendingCreates";

const runtime = vi.hoisted(() => ({ outcome: vi.fn(), create: vi.fn(), cancel: vi.fn(), navigate: vi.fn() }));
vi.mock("astro:actions", () => ({
  actions: {
    mutations: { outcome: runtime.outcome, cancel: runtime.cancel },
    recipes: { create: runtime.create },
  },
}));
vi.mock("@/lib/navigate", () => ({ softNavigate: runtime.navigate }));

const operationId = "baf5293c-f00b-45e1-a086-e4c1976c7476";
beforeEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
  document.body.dataset.accountId = "cook";
  // Only browser storage survives a refresh; no form state is supplied.
  sessionStorage.setItem("pantry:pending-create:cook:recipes.create", JSON.stringify({
    accountId: "cook", operationId, kind: "recipes.create", destination: "detail",
    payload: { title: "Original soup", instructions: ["Cook."] },
  }));
});
afterEach(cleanup);

it("lets a refreshed client confirm its original resource without creating another", async () => {
  runtime.outcome.mockResolvedValue({ data: { status: "completed", kind: "recipes.create", id: "original" } });
  const user = userEvent.setup();
  render(<PendingCreates />);
  expect(screen.getByText("Recipe: Original soup")).toBeTruthy();
  expect(runtime.outcome).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Check save status" }));
  await waitFor(() => expect(runtime.navigate).toHaveBeenCalledWith("/recipes/original"));
  expect(runtime.outcome).toHaveBeenCalledWith({ operationId, accountId: "cook" });
  expect(runtime.create).not.toHaveBeenCalled();
  expect(sessionStorage.length).toBe(0);
});

it("treats an absent receipt as unknown, not as a failed save", async () => {
  runtime.outcome.mockResolvedValue({ data: { status: "unknown" } });
  const user = userEvent.setup();
  render(<PendingCreates />);
  await user.click(screen.getByRole("button", { name: "Check save status" }));
  expect((await screen.findByRole("status")).textContent).toMatch(/may still finish/);
  expect(runtime.create).not.toHaveBeenCalled();
  expect(sessionStorage.length).toBe(1);
});

it("retries the stored payload with its original key only when explicitly requested", async () => {
  runtime.outcome.mockResolvedValue({ data: { status: "unknown" } });
  runtime.create.mockResolvedValue({ data: { id: "original" } });
  const user = userEvent.setup();
  render(<PendingCreates />);
  await user.click(screen.getByRole("button", { name: "Retry original save" }));
  await waitFor(() => expect(runtime.navigate).toHaveBeenCalledWith("/recipes/original"));
  expect(runtime.create).toHaveBeenCalledExactlyOnceWith({
    title: "Original soup", instructions: ["Cook."], operationId, accountId: "cook",
  });
});

it("keeps recovery controls usable after a network exception", async () => {
  runtime.outcome.mockRejectedValueOnce(new TypeError("Offline"));
  const user = userEvent.setup();
  render(<PendingCreates />);
  await user.click(screen.getByRole("button", { name: "Check save status" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/original submission is still remembered/);
  expect(screen.queryByText("Offline")).toBeNull();
  expect(screen.getByRole("button", { name: "Retry original save" })).toHaveProperty("disabled", false);
  expect(sessionStorage.length).toBe(1);
});

it("shows a safe toast for a recovery action's internal error", async () => {
  runtime.outcome.mockResolvedValueOnce({
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "SQLITE_ERROR: no such table: MutationOperation",
    },
  });
  const user = userEvent.setup();
  render(<PendingCreates />);
  await user.click(screen.getByRole("button", { name: "Check save status" }));

  expect((await screen.findByRole("alert")).textContent).toMatch(/Couldn't check this save/);
  expect(screen.queryByText(/SQLITE_ERROR|MutationOperation/)).toBeNull();
  expect(screen.getByRole("button", { name: "Retry original save" })).toHaveProperty("disabled", false);
  expect(sessionStorage.length).toBe(1);
});

it("shows a recovery validation error inline", async () => {
  runtime.outcome.mockResolvedValueOnce({
    error: { code: "BAD_REQUEST", message: "Ingredient quantity is invalid." },
  });
  const user = userEvent.setup();
  render(<PendingCreates />);
  await user.click(screen.getByRole("button", { name: "Check save status" }));

  expect(await screen.findByText("Ingredient quantity is invalid.")).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("settles an unresolved save before releasing the form for corrected input", async () => {
  runtime.cancel.mockResolvedValueOnce({ data: { status: "cancelled" } });
  const user = userEvent.setup();
  render(<PendingCreates />);
  await user.click(screen.getByRole("button", { name: "Cancel original save" }));
  expect((await screen.findByRole("status")).textContent).toMatch(/cancelled.*new submission/);
  expect(sessionStorage.length).toBe(0);
  expect(runtime.create).not.toHaveBeenCalled();
});

it("does not display another account's pending submission", () => {
  document.body.dataset.accountId = "other";
  render(<PendingCreates />);
  expect(screen.queryByRole("region", { name: "Unconfirmed saves" })).toBeNull();
  expect(runtime.outcome).not.toHaveBeenCalled();
});
