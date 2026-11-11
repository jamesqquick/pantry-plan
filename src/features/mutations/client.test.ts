// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelCreate, confirmCreate, createdResourcePath, readPendingCreates, retryCreate,
  SubmissionStorageError, submitCreate,
} from "./client";

const runtime = vi.hoisted(() => ({
  create: vi.fn(), order: vi.fn(), duplicate: vi.fn(), importRecipe: vi.fn(), outcome: vi.fn(), cancel: vi.fn(),
}));
vi.mock("astro:actions", () => ({
  actions: {
    recipes: { create: runtime.create, duplicate: runtime.duplicate },
    orders: { create: runtime.order },
    recipeImport: { saveTextOnly: runtime.importRecipe },
    mutations: { outcome: runtime.outcome, cancel: runtime.cancel },
  },
}));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  sessionStorage.clear();
  document.body.dataset.accountId = "cook";
  runtime.create.mockResolvedValue({ data: { id: "recipe-1" } });
  runtime.order.mockResolvedValue({ data: { id: "order-1" } });
  runtime.duplicate.mockResolvedValue({ data: { id: "copy-1" } });
  runtime.importRecipe.mockResolvedValue({ data: { recipeId: "import-1" } });
  runtime.outcome.mockResolvedValue({ data: { status: "unknown" } });
});

const payload = { title: "Soup", instructions: ["Cook."], servings: undefined };

async function interruptedCreate() {
  runtime.create.mockRejectedValueOnce(new TypeError("Connection lost"));
  await expect(submitCreate("recipes.create", payload)).rejects.toThrow("Connection lost");
  return readPendingCreates()[0]!;
}

describe("durable client submissions", () => {
  it("persists the key and original payload before sending and clears them on success", async () => {
    runtime.create.mockImplementationOnce(async (input) => {
      const stored = JSON.parse(sessionStorage.getItem(sessionStorage.key(0)!)!);
      expect(stored).toMatchObject({ accountId: "cook", operationId: input.operationId, payload: { title: "Soup", instructions: ["Cook."] } });
      expect(input.operationId).toMatch(/^[0-9a-f-]{36}$/);
      return { data: { id: "recipe-1" } };
    });
    expect(await submitCreate("recipes.create", payload)).toEqual({ data: { id: "recipe-1" } });
    expect(readPendingCreates()).toEqual([]);
    expect(runtime.outcome).not.toHaveBeenCalled();
  });

  it("checks the outcome before a user retry and reuses the original key", async () => {
    const entry = await interruptedCreate();
    await submitCreate("recipes.create", payload);
    expect(runtime.outcome).toHaveBeenCalledWith({ operationId: entry.operationId, accountId: "cook" });
    expect(runtime.create).toHaveBeenCalledTimes(2);
    expect(runtime.create.mock.calls[1][0]).toEqual(runtime.create.mock.calls[0][0]);
    expect(runtime.outcome.mock.invocationCallOrder[0]).toBeLessThan(runtime.create.mock.invocationCallOrder[1]!);
  });

  it("returns a confirmed original resource without sending another create", async () => {
    const entry = await interruptedCreate();
    runtime.outcome.mockResolvedValueOnce({ data: { status: "completed", kind: "recipes.create", id: "original" } });
    expect(await submitCreate("recipes.create", payload)).toEqual({ data: { id: "original" } });
    expect(runtime.create).toHaveBeenCalledOnce();
    expect(readPendingCreates()).toEqual([]);
    expect(runtime.outcome).toHaveBeenCalledWith({ operationId: entry.operationId, accountId: "cook" });
  });

  it("does not let a delayed confirmation erase a newer submission's key", async () => {
    const entry = await interruptedCreate();
    let complete!: (result: unknown) => void;
    runtime.outcome.mockReturnValueOnce(new Promise((resolve) => { complete = resolve; }));
    const checking = confirmCreate(entry);
    // A newer page instance replaces the slot while the old response is in flight.
    const newer = { ...entry, operationId: crypto.randomUUID(), payload: { title: "New soup" } };
    sessionStorage.setItem(sessionStorage.key(0)!, JSON.stringify(newer));
    complete({ data: { status: "completed", kind: "recipes.create", id: "original" } });
    await checking;
    expect(readPendingCreates()).toEqual([newer]);
  });

  it("cancels an uncertain submission before allowing corrected input with a new key", async () => {
    const entry = await interruptedCreate();
    runtime.cancel.mockResolvedValueOnce({ data: { status: "cancelled" } });
    expect((await cancelCreate(entry)).error?.message).toMatch(/cancelled/);
    expect(runtime.cancel).toHaveBeenCalledWith({ operationId: entry.operationId, accountId: "cook", kind: "recipes.create" });
    expect(readPendingCreates()).toEqual([]);
    await submitCreate("recipes.create", { ...payload, title: "Edited soup" });
    expect(runtime.create.mock.calls[1][0].title).toBe("Edited soup");
    expect(runtime.create.mock.calls[1][0].operationId).not.toBe(entry.operationId);
  });

  it("returns an already completed save instead of pretending it was cancelled", async () => {
    const entry = await interruptedCreate();
    runtime.cancel.mockResolvedValueOnce({ data: { status: "completed", id: "original", kind: "recipes.create" } });
    expect(await cancelCreate(entry)).toEqual({ data: { id: "original" } });
    expect(runtime.create).toHaveBeenCalledOnce();
    expect(readPendingCreates()).toEqual([]);
  });

  it("recovers a cancellation that completed after its response was lost", async () => {
    const entry = await interruptedCreate();
    runtime.outcome.mockResolvedValueOnce({ data: { status: "cancelled" } });
    expect((await confirmCreate(entry)).error?.message).toMatch(/cancelled/);
    expect(readPendingCreates()).toEqual([]);
    expect(runtime.create).toHaveBeenCalledOnce();
  });

  it("keeps the key when the cancellation response is lost", async () => {
    const entry = await interruptedCreate();
    runtime.cancel.mockRejectedValueOnce(new TypeError("Connection lost"));
    await expect(cancelCreate(entry)).rejects.toThrow();
    expect(readPendingCreates()).toEqual([entry]);
  });

  it("sends the original account identity even when the authenticated session changes elsewhere", async () => {
    const entry = await interruptedCreate();
    runtime.outcome.mockResolvedValueOnce({ error: { code: "FORBIDDEN", message: "Your signed-in account changed." } });
    await retryCreate(entry);
    expect(runtime.outcome).toHaveBeenCalledWith({ accountId: "cook", operationId: entry.operationId });
    expect(runtime.create).toHaveBeenCalledOnce();
    expect(readPendingCreates()).toEqual([entry]);
  });

  it("does not automatically retry after a network failure or an unknown outcome lookup", async () => {
    const entry = await interruptedCreate();
    expect(await confirmCreate(entry)).toEqual({});
    expect(runtime.create).toHaveBeenCalledOnce();
    expect(readPendingCreates()).toEqual([entry]);
  });

  it("blocks edited inputs until the previous unknown save is resolved", async () => {
    const entry = await interruptedCreate();
    const result = await submitCreate("recipes.create", { ...payload, title: "Edited soup" });
    expect(result.error?.message).toMatch(/earlier save has an unknown outcome/);
    expect(runtime.create).toHaveBeenCalledOnce();
    expect(readPendingCreates()).toEqual([entry]);
    await retryCreate(entry);
    expect(runtime.create.mock.calls[1][0].title).toBe("Soup");
  });

  it("preserves server validation fields and allows corrected input after a definite rejection", async () => {
    runtime.create.mockResolvedValueOnce({ error: { code: "BAD_REQUEST", message: "Title is required.", fields: { title: ["Required"] } } });
    const result = await submitCreate("recipes.create", { title: "" });
    expect(result.error?.fields).toEqual({ title: ["Required"] });
    expect(readPendingCreates()).toEqual([]);
    await submitCreate("recipes.create", payload);
    expect(runtime.create.mock.calls[1][0].operationId).not.toBe(runtime.create.mock.calls[0][0].operationId);
  });

  it.each(["TIMEOUT", "INTERNAL_SERVER_ERROR", "CONFLICT"])("retains the original submission after %s", async (code) => {
    runtime.create.mockResolvedValueOnce({ error: { code, message: "Save not confirmed" } });
    await submitCreate("recipes.create", payload);
    expect(readPendingCreates()).toHaveLength(1);
    expect(runtime.create).toHaveBeenCalledOnce();
  });

  it("does not submit when an outcome check fails", async () => {
    const entry = await interruptedCreate();
    runtime.outcome.mockResolvedValueOnce({ error: { code: "UNAUTHORIZED", message: "Sign in again" } });
    expect(await retryCreate(entry)).toEqual({ error: { code: "UNAUTHORIZED", message: "Sign in again" } });
    expect(runtime.create).toHaveBeenCalledOnce();
    expect(readPendingCreates()).toEqual([entry]);
  });

  it("retains an uncertain original submission even when a later retry fails validation", async () => {
    const entry = await interruptedCreate();
    runtime.create.mockResolvedValueOnce({ error: { code: "NOT_FOUND", message: "Source recipe was removed" } });
    await retryCreate(entry);
    expect(readPendingCreates()).toEqual([entry]);
  });

  it("does not discard a receipt with an unexpected action kind", async () => {
    const entry = await interruptedCreate();
    runtime.outcome.mockResolvedValueOnce({ data: { status: "completed", kind: "recipes.duplicate", id: "recipe-1" } });
    expect((await confirmCreate(entry)).error?.message).toMatch(/different action/);
    expect(readPendingCreates()).toEqual([entry]);
  });

  it("scopes remembered submissions by account and rejects cross-account recovery", async () => {
    const entry = await interruptedCreate();
    document.body.dataset.accountId = "other";
    expect(readPendingCreates()).toEqual([]);
    await expect(retryCreate(entry)).rejects.toBeInstanceOf(SubmissionStorageError);
    await expect(confirmCreate(entry)).rejects.toBeInstanceOf(SubmissionStorageError);
    expect(runtime.outcome).not.toHaveBeenCalled();
    document.body.dataset.accountId = "cook";
    expect(readPendingCreates()).toEqual([entry]);
  });

  it("prevents duplicate in-flight submissions", async () => {
    let complete!: (value: unknown) => void;
    runtime.create.mockReturnValueOnce(new Promise((resolve) => { complete = resolve; }));
    const first = submitCreate("recipes.create", payload);
    expect((await submitCreate("recipes.create", payload)).error?.message).toMatch(/already being saved/);
    expect(runtime.create).toHaveBeenCalledOnce();
    complete({ data: { id: "recipe-1" } });
    await first;
  });

  it("fails before sending if session storage is unavailable", async () => {
    vi.spyOn(Object.getPrototypeOf(sessionStorage), "setItem").mockImplementationOnce(() => { throw new DOMException("Quota exceeded"); });
    await expect(submitCreate("recipes.create", payload)).rejects.toBeInstanceOf(SubmissionStorageError);
    expect(runtime.create).not.toHaveBeenCalled();
  });

  it("ignores malformed records for display but refuses to overwrite their keys", async () => {
    sessionStorage.setItem("pantry:pending-create:cook:recipes.create", "{broken");
    expect(readPendingCreates()).toEqual([]);
    await expect(submitCreate("recipes.create", payload)).rejects.toBeInstanceOf(SubmissionStorageError);
    expect(runtime.create).not.toHaveBeenCalled();
  });

  it("persists import destinations and normalizes the import result", async () => {
    runtime.importRecipe.mockRejectedValueOnce(new TypeError("Connection lost"));
    await expect(submitCreate("recipeImport.saveTextOnly", { recipe: { title: "Soup" }, ingredients: ["1 tsp salt"] }, "map"))
      .rejects.toThrow();
    const entry = readPendingCreates()[0]!;
    expect(entry.destination).toBe("map");
    expect(await retryCreate(entry)).toEqual({ data: { id: "import-1" } });
    expect(createdResourcePath(entry, "import-1")).toBe("/recipes/import-1/map-ingredients");
  });

  it("sends a stable operation ID with duplicate FormData", async () => {
    runtime.duplicate.mockRejectedValueOnce(new TypeError("Connection lost"));
    await expect(submitCreate("recipes.duplicate", { recipeId: "source" })).rejects.toThrow();
    const entry = readPendingCreates()[0]!;
    await retryCreate(entry);
    const form = runtime.duplicate.mock.calls[1][0] as FormData;
    expect(form.get("recipeId")).toBe("source");
    expect(form.get("operationId")).toBe(entry.operationId);
    expect(form.get("accountId")).toBe("cook");
    expect(form.get("operationId")).toBe(runtime.duplicate.mock.calls[0][0].get("operationId"));
  });
});
