import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inspect } from "node:util";
import { DrizzleQueryError, eq } from "drizzle-orm";
import { createDb, recipe, session, user } from "@/db";
import { DatabaseBudget, DatabaseTimeoutError, withDatabaseBudget } from "@/lib/database-timeout";
import { createTestDb } from "@/test/d1";
import { withD1Deadline } from "./deadline-binding";

let test: ReturnType<typeof createTestDb>;
beforeEach(() => {
  test = createTestDb();
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  test.sqlite.close();
});

describe("D1 execution deadlines", () => {
  it("supports real Drizzle reads, bind arguments, and atomic batches", async () => {
    const budget = new DatabaseBudget();
    await withDatabaseBudget(budget, async () => {
      const db = createDb(test.binding);
      await db.batch([
        db.insert(user).values({ id: "cook", name: "Cook", email: "cook@example.test" }),
        db.insert(recipe).values({ id: "soup", userId: "cook", title: "Soup" }),
      ]);
      expect(await db.query.recipe.findFirst({ where: eq(recipe.id, "soup") })).toMatchObject({ title: "Soup" });
    });
    expect(budget.writeStarted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["all", "raw", "first", "run"] as const)("bounds D1 %s execution", async (method) => {
    const prototype = Object.getPrototypeOf(test.binding.prepare("SELECT 1"));
    vi.spyOn(prototype, method).mockImplementation(() => new Promise(() => {}));
    const binding = withD1Deadline(test.binding, new DatabaseBudget({}, 10));
    const statement = binding.prepare("SELECT 1").bind();
    const assertion = expect(method === "raw" ? statement.raw() : statement[method]()).rejects.toBeInstanceOf(DatabaseTimeoutError);
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
  });

  it("stops subsequent mutation and cleanup writes while the first write can still commit late", async () => {
    test.sqlite.exec(`INSERT INTO user (id, name, email, createdAt, updatedAt) VALUES ('cook', 'Cook', 'cook@example.test', 1, 1)`);
    const prototype = Object.getPrototypeOf(test.binding.prepare("SELECT 1"));
    const original = prototype.run;
    let complete!: () => void;
    const run = vi.spyOn(prototype, "run").mockImplementationOnce(function (this: D1PreparedStatement) {
      return new Promise((resolve) => { complete = () => resolve(original.call(this)); });
    });
    const budget = new DatabaseBudget({}, 10);
    const operation = withDatabaseBudget(budget, async () => {
      const db = createDb(test.binding);
      try {
        await db.insert(recipe).values({ id: "soup", userId: "cook", title: "Soup" });
        await db.update(recipe).set({ title: "Later step" });
      } catch {
        // Even compensating writes are unsafe after an unknown write outcome.
        await db.delete(recipe);
      }
    });
    const assertion = expect(operation).rejects.toBeInstanceOf(DatabaseTimeoutError);
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
    expect(run).toHaveBeenCalledOnce();
    expect(test.sqlite.prepare('SELECT * FROM "Recipe"').all()).toHaveLength(0);
    complete();
    await vi.runAllTimersAsync();
    expect(test.sqlite.prepare('SELECT title FROM "Recipe"').get()).toMatchObject({ title: "Soup" });
    expect(budget.writeStarted).toBe(true);
    expect(run).toHaveBeenCalledOnce();
  });

  it("unwraps prepared statements for native batch execution and bounds it", async () => {
    const batch = vi.spyOn(test.binding, "batch").mockImplementation(() => new Promise(() => {}));
    const budget = new DatabaseBudget({}, 10);
    const binding = withD1Deadline(test.binding, budget);
    const assertion = expect(binding.batch([binding.prepare("SELECT 1")])).rejects.toBeInstanceOf(DatabaseTimeoutError);
    await vi.advanceTimersByTimeAsync(10);
    await assertion;
    expect(batch).toHaveBeenCalledOnce();
    expect(budget.writeStarted).toBe(false);
  });

  it.each(["all", "get", "values", "execute", "run", "fluent", "relational"] as const)("redacts timeout query parameters before %s errors reach callers", async (method) => {
    const prototype = Object.getPrototypeOf(test.binding.prepare("SELECT 1"));
    for (const key of ["all", "raw", "run"] as const) {
      vi.spyOn(prototype, key).mockImplementation(() => new Promise(() => {}));
    }
    const budget = new DatabaseBudget({}, 10);
    const token = "private-session-token-for-redaction-test";
    const operation = withDatabaseBudget(budget, () => {
      const db = createDb(test.binding);
      if (method === "relational") return Promise.resolve(db.query.session.findFirst({ where: eq(session.token, token) }));
      const query = db.select().from(session).where(eq(session.token, token));
      return method === "fluent" ? Promise.resolve(query) : query.prepare()[method]();
    });
    let failure: unknown;
    const caught = operation.catch((error) => { failure = error; });
    await vi.advanceTimersByTimeAsync(10);
    await caught;
    expect(failure).toBe(budget.error);
    expect(inspect(failure, { depth: null })).not.toContain(token);
    expect(inspect(failure, { depth: null })).not.toContain("Failed query:");
  });

  it("preserves unrelated Drizzle errors and their original cause", async () => {
    const failure = new TypeError("Invalid database operation");
    vi.spyOn(Object.getPrototypeOf(test.binding.prepare("SELECT 1")), "raw").mockRejectedValue(failure);
    const operation = withDatabaseBudget(new DatabaseBudget(), () => createDb(test.binding).select().from(recipe));
    await expect(operation).rejects.toBeInstanceOf(DrizzleQueryError);
    await expect(operation).rejects.toMatchObject({ cause: failure });
  });
});
