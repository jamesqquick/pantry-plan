import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionAPIContext } from "astro:actions";
import { createDb, type Db } from "@/db";
import { createTestDb } from "@/test/d1";
import { DatabaseBudget, DatabaseTimeoutError, withDatabaseBudget } from "@/lib/database-timeout";
import { orders } from "./orders";
import { recipes } from "./recipes";
import { recipeImport } from "./import";
import { mutations } from "./mutations";

const runtime = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  queueSearchSync: vi.fn(async () => undefined),
}));
vi.mock("astro:actions", async () => {
  const { defineAction } = await import("../../node_modules/astro/dist/actions/runtime/server.js");
  const { ActionError } = await import("../../node_modules/astro/dist/actions/runtime/client.js");
  return { defineAction, ActionError };
});
vi.mock("./_shared", () => ({
  getDb: () => runtime.db,
  requireUser: (ctx: { locals: { user: { id: string } } }) => ctx.locals.user,
  queueSearchSync: runtime.queueSearchSync,
}));

function context(userId = "cook") {
  return {
    [Symbol.for("astro.actionAPIContext")]: true,
    locals: { user: { id: userId } },
  } as unknown as ActionAPIContext;
}

let test: ReturnType<typeof createTestDb>;
beforeEach(() => {
  test = createTestDb();
  runtime.db = test.db;
  runtime.queueSearchSync.mockClear();
  test.sqlite.exec(`
    INSERT INTO user (id, name, email, createdAt, updatedAt) VALUES
      ('cook', 'Cook', 'cook@example.test', 1, 1),
      ('other', 'Other', 'other@example.test', 1, 1);
    INSERT INTO Recipe (id, userId, title) VALUES ('source', 'cook', 'Soup');
    INSERT INTO RecipeInstruction (id, recipeId, sortOrder, text) VALUES ('step', 'source', 0, 'Cook.');
    INSERT INTO RecipeIngredient (id, recipeId, quantity, unit, displayText, sortOrder)
      VALUES ('salt', 'source', 1, 'TSP', 'salt', 0);
  `);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  test.sqlite.close();
});

const paths = ["recipes.create", "recipes.duplicate", "recipeImport.saveTextOnly"] as const;
type CreatePath = (typeof paths)[number];
async function create(path: CreatePath, operationId: string, changed = false, userId = "cook", accountId = userId) {
  const ctx = context(userId);
  switch (path) {
    case "recipes.create":
      return (await recipes.create.orThrow.call(ctx, {
        operationId, accountId, title: changed ? "Other soup" : "Soup", instructions: ["Cook."],
      })).id;
    case "recipes.duplicate": {
      const form = new FormData();
      form.set("recipeId", changed ? "missing-source" : "source");
      form.set("operationId", operationId);
      form.set("accountId", accountId);
      return (await recipes.duplicate.orThrow.call(ctx, form)).id;
    }
    case "recipeImport.saveTextOnly":
      return (await recipeImport.saveTextOnly.orThrow.call(ctx, {
        operationId, accountId, recipe: { title: changed ? "Other soup" : "Soup", instructions: ["Cook."] },
        ingredients: ["1 tsp salt"],
      })).recipeId;
  }
}
function outcome(operationId: string, userId = "cook") {
  return mutations.outcome.orThrow.call(context(userId), { operationId, accountId: userId });
}
function cancel(path: CreatePath, operationId: string, userId = "cook") {
  return mutations.cancel.orThrow.call(context(userId), { operationId, accountId: userId, kind: path });
}

describe.each(paths)("idempotent %s", (path) => {
  it("rejects a stale page after the authenticated account changes", async () => {
    await expect(create(path, crypto.randomUUID(), false, "other", "cook"))
      .rejects.toMatchObject({ code: "FORBIDDEN", message: expect.stringMatching(/account changed/) });
    expect(test.sqlite.prepare("SELECT * FROM MutationOperation").all()).toHaveLength(0);
  });

  it("prevents a cancelled submission from saving and permits a new corrected submission", async () => {
    const operationId = crypto.randomUUID();
    expect(await cancel(path, operationId)).toEqual({ status: "cancelled" });
    expect(await cancel(path, operationId)).toEqual({ status: "cancelled" });
    await expect(create(path, operationId)).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringMatching(/cancelled/) });
    expect(await outcome(operationId)).toEqual({ status: "cancelled" });
    await create(path, crypto.randomUUID());
  });

  it("returns the original result when a completed save wins the cancellation race", async () => {
    const operationId = crypto.randomUUID();
    const id = await create(path, operationId);
    expect(await cancel(path, operationId)).toEqual({ status: "completed", id, kind: path });
    expect(await create(path, operationId)).toBe(id);
  });

  it("rolls back the entire late create when cancellation wins the race", async () => {
    const operationId = crypto.randomUUID();
    const batch = test.binding.batch.bind(test.binding);
    let complete!: () => Promise<void>;
    const spy = vi.spyOn(test.binding, "batch").mockImplementationOnce((statements) => new Promise((resolve, reject) => {
      complete = async () => { await batch(statements).then(resolve, reject); };
    }));
    const pending = create(path, operationId);
    const assertion = expect(pending).rejects.toMatchObject({ code: "CONFLICT" });
    await vi.waitFor(() => expect(spy).toHaveBeenCalledOnce(), { interval: 1 });
    expect(await cancel(path, operationId)).toEqual({ status: "cancelled" });
    await complete();
    await assertion;
    expect(await outcome(operationId)).toEqual({ status: "cancelled" });
    expect(test.sqlite.prepare("SELECT * FROM Recipe").all()).toHaveLength(1);
  });

  it("returns the original resource on retry and confirms it from a fresh request", async () => {
    const operationId = crypto.randomUUID();
    const first = await create(path, operationId);
    const batch = vi.spyOn(test.binding, "batch");
    expect(await create(path, operationId)).toBe(first);
    expect(batch).not.toHaveBeenCalled();
    runtime.db = createDb(test.binding);
    expect(await outcome(operationId)).toEqual({ status: "completed", id: first, kind: path });
  });

  it("deduplicates simultaneous submissions using the database constraint", async () => {
    const operationId = crypto.randomUUID();
    const ids = await Promise.all(Array.from({ length: 4 }, () => create(path, operationId)));
    expect(new Set(ids).size).toBe(1);
    expect(test.sqlite.prepare("SELECT * FROM MutationOperation").all()).toHaveLength(1);
    expect(test.sqlite.prepare("SELECT * FROM Recipe").all()).toHaveLength(2);
  });

  it("rejects changed input for the same operation ID", async () => {
    const operationId = crypto.randomUUID();
    await create(path, operationId);
    await expect(create(path, operationId, true)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(test.sqlite.prepare("SELECT * FROM MutationOperation").all()).toHaveLength(1);
  });

  it("rolls back the receipt and resource on failure, allowing the same submission to retry", async () => {
    const operationId = crypto.randomUUID();
    const table = "RecipeInstruction";
    test.sqlite.exec(`CREATE TRIGGER fail_create BEFORE INSERT ON ${table}
      BEGIN SELECT RAISE(ABORT, 'injected write failure'); END;`);
    await expect(create(path, operationId)).rejects.toThrow(/injected write failure/);
    expect(await outcome(operationId)).toEqual({ status: "unknown" });
    expect(test.sqlite.prepare("SELECT * FROM Recipe").all()).toHaveLength(1);
    test.sqlite.exec("DROP TRIGGER fail_create");
    const id = await create(path, operationId);
    expect(await outcome(operationId)).toMatchObject({ status: "completed", id });
  });

  it("deduplicates a retry while the original timed-out batch is still outstanding", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const operationId = crypto.randomUUID();
    const batch = test.binding.batch.bind(test.binding);
    let complete!: () => Promise<void>;
    const spy = vi.spyOn(test.binding, "batch").mockImplementationOnce((statements) => new Promise((resolve, reject) => {
      complete = async () => { await batch(statements).then(resolve, reject); };
    }));
    const budget = new DatabaseBudget({}, 100);
    const pending = withDatabaseBudget(budget, () => {
      runtime.db = createDb(test.binding);
      return create(path, operationId);
    });
    const assertion = expect(pending).rejects.toBeInstanceOf(DatabaseTimeoutError);
    await vi.waitFor(() => expect(spy).toHaveBeenCalledOnce(), { interval: 1, timeout: 50 });
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    runtime.db = createDb(test.binding);
    expect(await outcome(operationId)).toEqual({ status: "unknown" });

    const id = await create(path, operationId);
    await complete();

    expect(await outcome(operationId)).toEqual({ status: "completed", id, kind: path });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(test.sqlite.prepare("SELECT * FROM MutationOperation").all()).toHaveLength(1);
    expect(test.sqlite.prepare("SELECT * FROM Recipe").all()).toHaveLength(2);
  });

  it.each(["commit", "rollback"] as const)("resolves a late %s after a timeout without retrying automatically", async (completion) => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const operationId = crypto.randomUUID();
    if (completion === "rollback") {
      const table = "RecipeInstruction";
      test.sqlite.exec(`CREATE TRIGGER fail_create BEFORE INSERT ON ${table}
        BEGIN SELECT RAISE(ABORT, 'late write failure'); END;`);
    }
    const batch = test.binding.batch.bind(test.binding);
    let complete!: () => Promise<void>;
    const spy = vi.spyOn(test.binding, "batch").mockImplementationOnce((statements) => new Promise((resolve, reject) => {
      complete = async () => { await batch(statements).then(resolve, reject); };
    }));
    const budget = new DatabaseBudget({}, 100);
    const pending = withDatabaseBudget(budget, () => {
      runtime.db = createDb(test.binding);
      return create(path, operationId);
    });
    const assertion = expect(pending).rejects.toBeInstanceOf(DatabaseTimeoutError);
    // Hashing uses Web Crypto, which completes outside fake timers.
    await vi.waitFor(() => expect(spy).toHaveBeenCalledOnce(), { interval: 1, timeout: 50 });
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    runtime.db = createDb(test.binding);
    expect(await outcome(operationId)).toEqual({ status: "unknown" });
    await complete();
    if (completion === "commit") {
      const saved = await outcome(operationId);
      expect(saved.status).toBe("completed");
      expect(await create(path, operationId)).toBe(saved.status === "completed" ? saved.id : undefined);
      expect(spy).toHaveBeenCalledOnce();
    } else {
      expect(await outcome(operationId)).toEqual({ status: "unknown" });
      test.sqlite.exec("DROP TRIGGER fail_create");
      await create(path, operationId);
      expect(spy).toHaveBeenCalledTimes(2);
    }
  });
});

it("creates an order in one request without storing a pending mutation receipt", async () => {
  const result = await orders.create.orThrow.call(context(), {
    name: "Weekend order",
    items: [{ recipeId: "source", batches: 1 }],
  });

  expect(result.id).toBeTruthy();
  expect(test.sqlite.prepare('SELECT * FROM "Order"').all()).toHaveLength(1);
  expect(test.sqlite.prepare("SELECT * FROM OrderItem").all()).toHaveLength(1);
  expect(test.sqlite.prepare("SELECT * FROM MutationOperation").all()).toHaveLength(0);
});

it("returns a safe error when an order write fails", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  test.sqlite.exec(`CREATE TRIGGER fail_order BEFORE INSERT ON OrderItem
    BEGIN SELECT RAISE(ABORT, 'injected write failure'); END;`);

  await expect(orders.create.orThrow.call(context(), {
    name: "Weekend order",
    items: [{ recipeId: "source", batches: 1 }],
  })).rejects.toMatchObject({
    code: "INTERNAL_SERVER_ERROR",
    message: "Couldn't save the order. Check your connection and try again.",
  });
  expect(test.sqlite.prepare('SELECT * FROM "Order"').all()).toHaveLength(0);
  expect(console.error).toHaveBeenCalledWith("Unexpected error in orders.create", expect.anything());
});

it("isolates outcomes and uniqueness by account", async () => {
  const operationId = crypto.randomUUID();
  const first = await create("recipes.create", operationId);
  expect(await outcome(operationId, "other")).toEqual({ status: "unknown" });
  const second = await create("recipes.create", operationId, false, "other");
  expect(second).not.toBe(first);
  expect(await outcome(operationId, "other")).toMatchObject({ id: second });
});

it("rejects reuse across create types", async () => {
  const operationId = crypto.randomUUID();
  await create("recipes.create", operationId);
  await expect(create("recipeImport.saveTextOnly", operationId)).rejects.toMatchObject({ code: "CONFLICT" });
});

it("rejects outcome and cancellation requests from a stale account page", async () => {
  const input = { operationId: crypto.randomUUID(), accountId: "cook" };
  await expect(mutations.outcome.orThrow.call(context("other"), input)).rejects.toMatchObject({ code: "FORBIDDEN" });
  await expect(mutations.cancel.orThrow.call(context("other"), { ...input, kind: "recipes.create" }))
    .rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(test.sqlite.prepare("SELECT * FROM MutationOperation").all()).toHaveLength(0);
});

it("keeps a completed receipt when the created resource is later deleted", async () => {
  const operationId = crypto.randomUUID();
  const id = await create("recipes.create", operationId);
  test.sqlite.prepare("DELETE FROM Recipe WHERE id = ?").run(id);
  expect(await create("recipes.create", operationId)).toBe(id);
  expect(test.sqlite.prepare("SELECT * FROM Recipe").all()).toHaveLength(1);
});

it("rejects missing and malformed operation IDs before writes", async () => {
  for (const operationId of [undefined, "not-a-uuid"]) {
    await expect(recipes.create.orThrow.call(context(), {
      title: "Soup", instructions: ["Cook."], operationId, accountId: "cook",
    } as never)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  }
  expect(test.sqlite.prepare("SELECT * FROM MutationOperation").all()).toHaveLength(0);
});
