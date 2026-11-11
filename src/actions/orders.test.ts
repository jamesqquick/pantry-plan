import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionAPIContext } from "astro:actions";
import type { Db } from "@/db";
import { createTestDb } from "@/test/d1";
import { orders } from "./orders";

const runtime = vi.hoisted(() => ({ db: undefined as Db | undefined }));
vi.mock("astro:actions", async () => {
  const { defineAction } = await import("../../node_modules/astro/dist/actions/runtime/server.js");
  const { ActionError } = await import("../../node_modules/astro/dist/actions/runtime/client.js");
  return { defineAction, ActionError };
});
vi.mock("./_shared", () => ({
  getDb: () => runtime.db,
  requireUser: (ctx: { locals: { user: { id: string } } }) => ctx.locals.user,
}));

function context(userId = "cook") {
  return {
    [Symbol.for("astro.actionAPIContext")]: true,
    locals: { user: { id: userId } },
  } as unknown as ActionAPIContext;
}

const items = [{ recipeId: "recipe-123", batches: 1 }];
let test: ReturnType<typeof createTestDb>;

beforeEach(() => {
  test = createTestDb();
  runtime.db = test.db;
  test.sqlite.exec(`
    INSERT INTO user (id, name, email, createdAt, updatedAt) VALUES
      ('cook', 'Cook', 'cook@example.test', 1, 1),
      ('other', 'Other', 'other@example.test', 1, 1);
    INSERT INTO Recipe (id, userId, title) VALUES ('recipe-123', 'cook', 'Cookies');
    INSERT INTO "Order" (id, userId, name) VALUES ('legacy-order', 'cook', 'Legacy order');
    INSERT INTO OrderItem (id, orderId, recipeId, batches)
      VALUES ('legacy-item', 'legacy-order', 'recipe-123', 1);
  `);
});

afterEach(() => {
  vi.restoreAllMocks();
  test.sqlite.close();
});

function savedTotal(id: string) {
  return test.sqlite.prepare('SELECT totalCostCents FROM "Order" WHERE id = ?').get(id);
}

describe("order totals", () => {
  it("defaults a database insert without a total to zero", () => {
    expect(savedTotal("legacy-order")).toEqual({ totalCostCents: 0 });
  });

  it.each([0, 2000, 2050])("persists an explicit total of %i cents when creating an order", async (totalCostCents) => {
    const { id } = await orders.create.orThrow.call(context(), {
      name: "Order", totalCostCents, items,
    });

    expect(savedTotal(id)).toEqual({ totalCostCents });
  });

  it("updates the total and allows it to be changed to zero", async () => {
    for (const totalCostCents of [2050, 0]) {
      await orders.update.orThrow.call(context(), { id: "legacy-order", name: "Order", totalCostCents, items });
      expect(savedTotal("legacy-order")).toEqual({ totalCostCents });
    }
  });

  it("defaults an omitted create total and preserves the saved total when update omits it", async () => {
    const { id } = await orders.create.orThrow.call(context(), {
      name: "Zero-total order", items,
    });
    expect(savedTotal(id)).toEqual({ totalCostCents: 0 });

    test.sqlite.prepare('UPDATE "Order" SET totalCostCents = ? WHERE id = ?').run(1250, "legacy-order");
    await orders.update.orThrow.call(context(), {
      id: "legacy-order", name: "Changed", items,
    });
    expect(savedTotal("legacy-order")).toEqual({ totalCostCents: 1250 });
  });

  it("does not allow another user to change an order's total", async () => {
    await expect(orders.update.orThrow.call(context("other"), {
      id: "legacy-order", name: "Order", totalCostCents: 2000, items,
    })).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(savedTotal("legacy-order")).toEqual({ totalCostCents: 0 });
  });

  it("returns a safe error and rolls back an order when an item write fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    test.sqlite.exec(`CREATE TRIGGER fail_order BEFORE INSERT ON OrderItem
      BEGIN SELECT RAISE(ABORT, 'injected write failure'); END;`);

    await expect(orders.create.orThrow.call(context(), {
      name: "Failed order",
      items,
    })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "Couldn't save the order. Check your connection and try again.",
    });
    expect(test.sqlite.prepare('SELECT * FROM "Order" WHERE name = ?').all("Failed order")).toEqual([]);
    expect(console.error).toHaveBeenCalledWith("Unexpected error in orders.create", expect.anything());
  });
});
