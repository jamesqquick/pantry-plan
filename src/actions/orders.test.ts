import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionAPIContext } from "astro:actions";
import type { Db } from "@/db";
import { createTestDb } from "@/test/d1";
import { orders } from "./orders";
import { material } from "@/db";
import { materialLineCost } from "@/features/materials/materials";

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

describe("order material snapshots", () => {
  beforeEach(async () => {
    await test.db.insert(material).values([
      { id: "labels", userId: "cook", name: "Logo labels", category: "Labels & print", usageUnit: "each", packageQuantity: 500, packagePriceCents: 625, productUrl: "https://shop.example.com/labels" },
      { id: "wrap", userId: "cook", name: "Kraft wrap", category: "Wrapping & liners", usageUnit: "ft", packageQuantity: 30, packagePriceCents: 1200 },
      { id: "private", userId: "other", name: "Private supply", category: "Bags", usageUnit: "each", packageQuantity: 10, packagePriceCents: 100 },
    ]);
  });

  function snapshots(id: string) {
    return test.sqlite.prepare("SELECT materialId, name, usageUnit, unitCostCents, quantity, productUrl FROM OrderMaterial WHERE orderId = ? ORDER BY materialId").all(id);
  }

  it("captures server prices and fractional usage without changing the customer total", async () => {
    const { id } = await orders.create.orThrow.call(context(), {
      name: "Birthday", items, totalCostCents: 5000,
      materials: [{ materialId: "labels", quantity: 24 }, { materialId: "wrap", quantity: 4.5 }],
    });
    expect(snapshots(id)).toEqual([
      { materialId: "labels", name: "Logo labels", usageUnit: "each", unitCostCents: 1.25, quantity: 24, productUrl: "https://shop.example.com/labels" },
      { materialId: "wrap", name: "Kraft wrap", usageUnit: "ft", unitCostCents: 40, quantity: 4.5, productUrl: null },
    ]);
    expect(savedTotal(id)).toEqual({ totalCostCents: 5000 });
    expect(materialLineCost(1.25, 24) + materialLineCost(40, 4.5)).toBe(210);
  });

  it("preserves saved names, units, links, and prices after catalog edits and usage changes", async () => {
    const { id } = await orders.create.orThrow.call(context(), {
      name: "Birthday", items, materials: [{ materialId: "labels", quantity: 24 }],
    });
    test.sqlite.exec("UPDATE Material SET name = 'New labels', usageUnit = 'ft', packagePriceCents = 5000, productUrl = NULL WHERE id = 'labels'");
    await orders.update.orThrow.call(context(), {
      id, name: "Updated", items, status: "COMPLETED",
      materials: [{ materialId: "labels", quantity: 0.5 }, { materialId: "wrap", quantity: 4.5 }],
    });
    expect(snapshots(id)[0]).toEqual({
      materialId: "labels", name: "Logo labels", usageUnit: "each", unitCostCents: 1.25, quantity: 0.5, productUrl: "https://shop.example.com/labels",
    });
    const fresh = await orders.create.orThrow.call(context(), {
      name: "Fresh", items, materials: [{ materialId: "labels", quantity: 1 }],
    });
    expect(snapshots(fresh.id)[0]).toMatchObject({ name: "New labels", usageUnit: "ft", unitCostCents: 10 });
  });

  it("keeps snapshots when omitted, removes deselected lines, and supports clearing all materials", async () => {
    const { id } = await orders.create.orThrow.call(context(), {
      name: "Birthday", items, materials: [{ materialId: "labels", quantity: 24 }, { materialId: "wrap", quantity: 4.5 }],
    });
    await orders.update.orThrow.call(context(), { id, name: "Renamed", items });
    expect(snapshots(id)).toHaveLength(2);
    await orders.update.orThrow.call(context(), { id, name: "Renamed", items, materials: [{ materialId: "wrap", quantity: 2 }] });
    expect(snapshots(id)).toHaveLength(1);
    expect(snapshots(id)[0]).toMatchObject({ materialId: "wrap", quantity: 2 });
    await orders.update.orThrow.call(context(), { id, name: "Renamed", items, materials: [] });
    expect(snapshots(id)).toEqual([]);
  });

  it("rejects foreign and missing materials without partially saving the order", async () => {
    for (const materialId of ["private", "missing"]) {
      await expect(orders.create.orThrow.call(context(), {
        name: "Forbidden", items, materials: [{ materialId, quantity: 1 }],
      })).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(test.sqlite.prepare('SELECT id FROM "Order" WHERE name = ?').all("Forbidden")).toEqual([]);
  });

  it("rolls back order metadata, recipes, and snapshots when a material write fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    test.sqlite.exec(`CREATE TRIGGER fail_material BEFORE INSERT ON OrderMaterial
      BEGIN SELECT RAISE(ABORT, 'injected material failure'); END;`);
    await expect(orders.update.orThrow.call(context(), {
      id: "legacy-order", name: "Failed update", totalCostCents: 900, items,
      materials: [{ materialId: "labels", quantity: 2 }],
    })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(test.sqlite.prepare('SELECT name, totalCostCents FROM "Order" WHERE id = ?').get("legacy-order"))
      .toEqual({ name: "Legacy order", totalCostCents: 0 });
    expect(test.sqlite.prepare("SELECT id FROM OrderItem WHERE orderId = ?").all("legacy-order")).toEqual([{ id: "legacy-item" }]);
  });

  it("cascades snapshot deletion with its order", async () => {
    const { id } = await orders.create.orThrow.call(context(), {
      name: "Birthday", items, materials: [{ materialId: "labels", quantity: 24 }],
    });
    const form = new FormData();
    form.set("id", id);
    await orders.delete.orThrow.call(context(), form);
    expect(snapshots(id)).toEqual([]);
  });

  it("saves the maximum 100 materials within D1's per-statement binding limit", async () => {
    const insert = test.sqlite.prepare("INSERT INTO Material (id, userId, name, category, usageUnit, packageQuantity, packagePriceCents) VALUES (?, 'cook', 'Supply', 'Bags', 'each', 500, 625)");
    const materials = Array.from({ length: 100 }, (_, index) => {
      const materialId = `supply-${index}`;
      insert.run(materialId);
      return { materialId, quantity: 0.5 };
    });
    const parameterCounts: number[] = [];
    const prepare = test.binding.prepare.bind(test.binding);
    vi.spyOn(test.binding, "prepare").mockImplementation((query) => {
      const statement = prepare(query);
      const bind = statement.bind.bind(statement);
      vi.spyOn(statement, "bind").mockImplementation((...params) => {
        parameterCounts.push(params.length);
        return bind(...params);
      });
      return statement;
    });
    const { id } = await orders.create.orThrow.call(context(), { name: "Large order", items, materials });
    expect(snapshots(id)).toHaveLength(100);
    expect(Math.max(...parameterCounts)).toBeLessThanOrEqual(100);
  });
});
