import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionAPIContext } from "astro:actions";
import type { Db } from "@/db";
import { createTestDb } from "@/test/d1";
import { materials } from "./materials";

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
    [Symbol.for("astro.actionAPIContext")]: true, locals: { user: { id: userId } },
  } as unknown as ActionAPIContext;
}

const values = {
  name: " Labels ", category: "Labels & print" as const, usageUnit: "each" as const,
  packageQuantity: 500, packagePriceCents: 625, productUrl: "https://shop.example.com/labels",
};
let test: ReturnType<typeof createTestDb>;
beforeEach(() => {
  test = createTestDb();
  runtime.db = test.db;
  test.sqlite.exec(`INSERT INTO user (id, name, email, createdAt, updatedAt) VALUES
    ('cook', 'Cook', 'cook@example.test', 1, 1), ('other', 'Other', 'other@example.test', 1, 1)`);
});
afterEach(() => test.sqlite.close());

describe("materials catalog actions", () => {
  it("creates and edits a private material, including clearing its product URL", async () => {
    const saved = await materials.create.orThrow.call(context(), values);
    expect(saved).toMatchObject({ name: "Labels", userId: "cook", packagePriceCents: 625, packageQuantity: 500 });
    const edited = await materials.update.orThrow.call(context(), {
      ...values, id: saved.id, packagePriceCents: 800, productUrl: "",
    });
    expect(edited).toMatchObject({ id: saved.id, packagePriceCents: 800, productUrl: null });
  });

  it("does not let another user edit the catalog record", async () => {
    const saved = await materials.create.orThrow.call(context(), values);
    await expect(materials.update.orThrow.call(context("other"), {
      ...values, id: saved.id, name: "Foreign edit",
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(test.sqlite.prepare("SELECT name FROM Material WHERE id = ?").get(saved.id)).toEqual({ name: "Labels" });
  });
});
