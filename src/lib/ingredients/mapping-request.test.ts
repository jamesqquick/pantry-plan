import { afterEach, describe, expect, it, vi } from "vitest";
import { createIngredientMappingRequest, IngredientMappingLimitError, IngredientMappingTimeoutError, MAX_MAPPING_REQUESTS } from "./mapping-request";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("ingredient mapping provider budget", () => {
  it("accounts for search, Clef and generation and runs admission before provider calls", async () => {
    const calls: string[] = [];
    const control = createIngredientMappingRequest(async (stage) => { calls.push(`admit:${stage}`); });
    for (const stage of ["search", "clef", "generation"] as const) await control.run(stage, async () => { calls.push(stage); });
    expect(calls).toEqual(["admit:search", "search", "admit:clef", "clef", "admit:generation", "generation"]);
    expect(control.counts).toEqual({ search: 1, clef: 1, generation: 1 });
  });

  it("enforces stage ceilings even for overlapping calls", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const control = createIngredientMappingRequest();
    const call = vi.fn(async () => undefined);
    const outcomes = await Promise.allSettled(Array.from({ length: MAX_MAPPING_REQUESTS.search + 1 }, () => control.run("search", call)));
    expect(call).toHaveBeenCalledTimes(MAX_MAPPING_REQUESTS.search);
    expect(outcomes.at(-1)).toMatchObject({ status: "rejected", reason: expect.any(IngredientMappingLimitError) });
  });

  it("does not start a provider call after denied admission", async () => {
    const control = createIngredientMappingRequest(async () => { throw new TypeError("rate limited"); });
    const call = vi.fn();
    await expect(control.run("search", call)).rejects.toThrow("rate limited");
    expect(call).not.toHaveBeenCalled(); expect(control.counts.search).toBe(0);
  });

  it("times out a hanging admission without starting its provider later", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const control = createIngredientMappingRequest(() => new Promise<void>((resolve) => { release = resolve; }));
    const call = vi.fn();
    const pending = expect(control.run("search", call)).rejects.toBeInstanceOf(IngredientMappingTimeoutError);
    await vi.advanceTimersByTimeAsync(8_000);
    await pending; release(); await Promise.resolve(); await Promise.resolve();
    expect(call).not.toHaveBeenCalled();
  });

  it("rejects new work after the whole-preview deadline", async () => {
    const control = createIngredientMappingRequest();
    vi.spyOn(Date, "now").mockReturnValue(control.deadline);
    const call = vi.fn();
    await expect(control.run("clef", call)).rejects.toBeInstanceOf(IngredientMappingTimeoutError);
    expect(call).not.toHaveBeenCalled();
  });
});
