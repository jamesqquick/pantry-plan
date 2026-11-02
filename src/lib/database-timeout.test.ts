import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseBudget, DatabaseTimeoutError, getDatabaseBudget, withDatabaseBudget, withDatabaseTimeout } from "./database-timeout";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("withDatabaseTimeout", () => {
  it("rejects a never-settling operation at the deadline", async () => {
    const result = withDatabaseTimeout(new Promise<never>(() => {}), 50, "test.read");
    const assertion = expect(result).rejects.toMatchObject({ name: "DatabaseTimeoutError", timeoutMs: 50, operation: "test.read" });
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves results from promises and lazy PromiseLike queries, clearing timers", async () => {
    const value = { id: 1 };
    const started = vi.fn();
    const query: PromiseLike<typeof value> = {
      then(onfulfilled, onrejected) {
        started();
        return Promise.resolve(value).then(onfulfilled, onrejected);
      },
    };
    await expect(withDatabaseTimeout(query)).resolves.toBe(value);
    expect(started).toHaveBeenCalledOnce();
    await expect(withDatabaseTimeout(Promise.resolve(value))).resolves.toBe(value);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves an immediate rejection without waiting", async () => {
    const error = new TypeError("Invalid operation");
    await expect(withDatabaseTimeout(Promise.reject(error))).rejects.toBe(error);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("handles late rejections and does not cancel late writes", async () => {
    let reject!: (error: Error) => void;
    let resolve!: (value: string) => void;
    const lateRejection = new Promise<never>((_, fail) => { reject = fail; });
    const lateWrite = new Promise<string>((done) => { resolve = done; });
    const read = expect(withDatabaseTimeout(lateRejection, 10)).rejects.toBeInstanceOf(DatabaseTimeoutError);
    const write = expect(withDatabaseTimeout(lateWrite, 10)).rejects.toBeInstanceOf(DatabaseTimeoutError);
    await vi.advanceTimersByTimeAsync(10);
    await Promise.all([read, write]);
    reject(new TypeError("Late failure"));
    resolve("committed");
    await expect(lateWrite).resolves.toBe("committed");
    await vi.runAllTimersAsync();
  });
});

describe("DatabaseBudget", () => {
  it("shares the remaining wall-clock budget across auth and page reads", async () => {
    const budget = new DatabaseBudget({}, 100);
    const auth = budget.run("auth.session", () => new Promise((resolve) => setTimeout(resolve, 60)));
    await vi.advanceTimersByTimeAsync(60);
    await auth;
    const read = budget.run("recipes.read", () => new Promise<never>(() => {}));
    const assertion = expect(read).rejects.toMatchObject({ timeoutMs: 100, operation: "recipes.read" });
    await vi.advanceTimersByTimeAsync(40);
    await assertion;
    const later = vi.fn(async () => "not started");
    await expect(budget.run("later.write", later, true)).rejects.toBe(budget.error);
    expect(later).not.toHaveBeenCalled();
    expect(budget.writeStarted).toBe(false);
  });

  it("does not start work after an expired deadline even before a timeout is observed", async () => {
    const budget = new DatabaseBudget({}, 100);
    await vi.advanceTimersByTimeAsync(100);
    const start = vi.fn(async () => null);
    await expect(budget.run("read", start)).rejects.toBeInstanceOf(DatabaseTimeoutError);
    expect(start).not.toHaveBeenCalled();
  });

  it("counts database waits for long actions without counting AI processing or double-counting overlap", async () => {
    const budget = new DatabaseBudget({ databaseTimeOnly: true }, 100);
    const first = budget.run("auth.session", () => new Promise((resolve) => setTimeout(resolve, 40)));
    const overlapping = budget.run("read", () => new Promise((resolve) => setTimeout(resolve, 40)));
    await vi.advanceTimersByTimeAsync(40);
    await Promise.all([first, overlapping]);
    await vi.advanceTimersByTimeAsync(60_000);
    const last = budget.run("after.ai", () => new Promise<never>(() => {}));
    const assertion = expect(last).rejects.toBeInstanceOf(DatabaseTimeoutError);
    await vi.advanceTimersByTimeAsync(59);
    expect(budget.error).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
  });

  it("isolates concurrent request contexts", async () => {
    const first = new DatabaseBudget();
    const second = new DatabaseBudget();
    await Promise.all([first, second].map((budget) => withDatabaseBudget(budget, async () => {
      await Promise.resolve();
      expect(getDatabaseBudget()).toBe(budget);
    })));
    expect(getDatabaseBudget()).toBeUndefined();
  });

  it("logs bounded diagnostic context once without SQL or credentials", async () => {
    const budget = new DatabaseBudget({ route: "/recipes/[id]", requestId: "test-ray" }, 10);
    const result = expect(budget.run("d1.run", () => new Promise<never>(() => {}), true)).rejects.toBeInstanceOf(DatabaseTimeoutError);
    await vi.advanceTimersByTimeAsync(10);
    await result;
    await expect(budget.run("later", async () => null)).rejects.toBe(budget.error);
    expect(console.error).toHaveBeenCalledOnce();
    expect(JSON.parse(vi.mocked(console.error).mock.calls[0]![0])).toEqual({
      event: "database_timeout", operation: "d1.run", route: "/recipes/[id]", requestId: "test-ray", elapsedMs: 10, budgetMs: 10, writeStarted: true,
    });
  });
});
