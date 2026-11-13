import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ActionAPIContext } from "astro:actions";
import type { Db } from "@/db";
import { createTestDb } from "@/test/d1";
import { recipeImport } from "./import";

const runtime = vi.hoisted(() => ({ db: undefined as Db | undefined }));

vi.mock("astro:actions", async () => {
  const { defineAction } = await import("../../node_modules/astro/dist/actions/runtime/server.js");
  const { ActionError } = await import("../../node_modules/astro/dist/actions/runtime/client.js");
  return { defineAction, ActionError };
});
vi.mock("./_shared", () => ({
  getDb: () => runtime.db,
  requireUser: (ctx: { locals: { user: { id: string } } }) => ctx.locals.user,
  queueSearchSync: vi.fn(async () => undefined),
}));

let test: ReturnType<typeof createTestDb>;
const ctx = {
  [Symbol.for("astro.actionAPIContext")]: true,
  locals: { user: { id: "cook" } },
} as unknown as ActionAPIContext;

beforeEach(() => {
  test = createTestDb();
  runtime.db = test.db;
  test.sqlite.exec(`INSERT INTO user (id, name, email, createdAt, updatedAt)
    VALUES ('cook', 'Cook', 'cook@example.test', 1, 1)`);
});
afterEach(() => test.sqlite.close());

it("creates and links a staged tag in the mapped import batch", async () => {
  const batch = vi.spyOn(test.binding, "batch");
  const result = await recipeImport.saveWithMappings.orThrow.call(ctx, {
    recipe: { title: "Pasta", instructions: ["Cook."], newTagNames: [" Dinner "] },
    ingredientLines: [{ originalLine: "1 cup flour", displayText: "flour", quantity: 1, unit: "CUP", sortOrder: 0 }],
  });

  expect(batch).toHaveBeenCalledOnce();
  expect(test.sqlite.prepare(`SELECT t.name FROM RecipeTag rt JOIN Tag t ON t.id = rt.tagId
    WHERE rt.recipeId = ?`).all(result.recipeId)).toEqual([{ name: "Dinner" }]);
});

it("saves a staged tag when mapped lines share an alias", async () => {
  const result = await recipeImport.saveWithMappings.orThrow.call(ctx, {
    recipe: { title: "Pasta", instructions: ["Cook."], newTagNames: ["Dinner"] },
    ingredientLines: [0, 1].map((sortOrder) => ({
      originalLine: "1 cup flour", displayText: "flour", createName: "flour",
      quantity: 1, unit: "CUP" as const, sortOrder,
    })),
  });

  expect(test.sqlite.prepare("SELECT aliasNormalized FROM IngredientAlias").all()).toHaveLength(1);
  expect(test.sqlite.prepare("SELECT id FROM Recipe WHERE id = ?").all(result.recipeId)).toHaveLength(1);
  expect(test.sqlite.prepare(`SELECT t.name FROM RecipeTag rt JOIN Tag t ON t.id = rt.tagId
    WHERE rt.recipeId = ?`).all(result.recipeId)).toEqual([{ name: "Dinner" }]);
});

it("reports success for a committed recipe and tag even if best-effort alias writes fail", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  test.sqlite.exec(`CREATE TRIGGER fail_alias BEFORE INSERT ON IngredientAlias
    BEGIN SELECT RAISE(ABORT, 'injected alias failure'); END;`);

  const result = await recipeImport.saveWithMappings.orThrow.call(ctx, {
    recipe: { title: "Pasta", instructions: ["Cook."], newTagNames: ["Dinner"] },
    ingredientLines: [{ originalLine: "1 cup flour", displayText: "flour", createName: "flour",
      quantity: 1, unit: "CUP", sortOrder: 0 }],
  });

  expect(log).toHaveBeenCalledWith("Failed to save ingredient aliases after recipe import", expect.any(Error));
  expect(test.sqlite.prepare("SELECT id FROM Recipe WHERE id = ?").all(result.recipeId)).toHaveLength(1);
  expect(test.sqlite.prepare(`SELECT t.name FROM RecipeTag rt JOIN Tag t ON t.id = rt.tagId
    WHERE rt.recipeId = ?`).all(result.recipeId)).toEqual([{ name: "Dinner" }]);
  log.mockRestore();
});
