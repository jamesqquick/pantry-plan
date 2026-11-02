import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recipeIngredient, recipeInstruction, recipeTag, tag } from "@/db";
import { MAX_PARAMS_PER_STATEMENT } from "@/db/chunked-insert";
import { createTestDb } from "@/test/d1";
import { createMcpRecipe } from "./create-recipe";
import { editMcpRecipe } from "./edit-recipe";
import { getMcpRecipe } from "./get-recipe";
import { RecipeNotFoundError } from "./recipe-errors";

let test: ReturnType<typeof createTestDb>;
const recipeInput = {
  title: "Soup",
  ingredients: [{ quantity: 1, unit: "CUP" as const, displayText: "stock" }],
  instructions: ["Simmer."],
};

beforeEach(() => {
  test = createTestDb();
  test.sqlite.exec(`
    INSERT INTO user (id, name, email, createdAt, updatedAt) VALUES
      ('cook', 'Cook', 'cook@example.test', 1, 1),
      ('other', 'Other', 'other@example.test', 1, 1);
    INSERT INTO Tag (id, userId, name) VALUES
      ('dinner', 'cook', 'Dinner'),
      ('other-dinner', 'other', 'Dinner'),
      ('other-soup', 'other', 'Soup'),
      ('private', 'other', 'Private');
    INSERT INTO Recipe (id, userId, title) VALUES ('existing', 'cook', 'Soup');
    INSERT INTO RecipeIngredient (id, recipeId, quantity, unit, displayText, sortOrder)
      VALUES ('ingredient', 'existing', 1, 'CUP', 'stock', 0);
    INSERT INTO RecipeInstruction (id, recipeId, text, sortOrder)
      VALUES ('instruction', 'existing', 'Simmer.', 0);
  `);
});

afterEach(() => {
  vi.restoreAllMocks();
  test.sqlite.close();
});

function snapshot() {
  return {
    recipes: test.sqlite.prepare("SELECT * FROM Recipe ORDER BY id").all(),
    ingredients: test.sqlite.prepare("SELECT * FROM RecipeIngredient ORDER BY id").all(),
    instructions: test.sqlite.prepare("SELECT * FROM RecipeInstruction ORDER BY id").all(),
    tags: test.sqlite.prepare("SELECT * FROM Tag ORDER BY id").all(),
    associations: test.sqlite.prepare("SELECT * FROM RecipeTag ORDER BY id").all(),
  };
}

function mutate(method: "create" | "edit", tags?: string[]) {
  return method === "create"
    ? createMcpRecipe(test.db, "cook", { ...recipeInput, tags })
    : editMcpRecipe(test.db, "cook", { recipeId: "existing", title: "Updated soup", tags });
}

describe.each(["create", "edit"] as const)("MCP recipe tags on %s", (method) => {
  it("trims and deduplicates names, reuses owned tags, and creates missing owned tags", async () => {
    const batch = vi.spyOn(test.binding, "batch");

    const { recipeId } = await mutate(method, [" Dinner ", "Soup", "Dinner", " Soup "]);

    expect(batch).toHaveBeenCalledOnce();
    expect(await getMcpRecipe(test.db, "cook", recipeId)).toMatchObject({ tags: ["Dinner", "Soup"] });
    expect(test.sqlite.prepare("SELECT id, name FROM Tag WHERE userId = 'cook' ORDER BY name").all())
      .toEqual([{ id: "dinner", name: "Dinner" }, { id: expect.any(String), name: "Soup" }]);
    expect(test.sqlite.prepare("SELECT tagId FROM RecipeTag WHERE recipeId = ? ORDER BY tagId").all(recipeId))
      .toEqual(expect.arrayContaining([{ tagId: "dinner" }]));
    expect(test.sqlite.prepare("SELECT * FROM RecipeTag WHERE tagId IN ('other-dinner', 'other-soup', 'private')").all())
      .toEqual([]);
    expect(test.sqlite.prepare("SELECT * FROM Tag WHERE userId = 'other'").all()).toHaveLength(3);
  });

  it.each([undefined, []])("allows a recipe without tags: %o", async (tags) => {
    const { recipeId } = await mutate(method, tags);
    expect((await getMcpRecipe(test.db, "cook", recipeId)).tags).toEqual([]);
  });

  it("resolves a tag inserted after the mutation was prepared", async () => {
    const originalBatch = test.binding.batch.bind(test.binding);
    vi.spyOn(test.binding, "batch").mockImplementationOnce(async (statements) => {
      await test.db.insert(tag).values({ id: "concurrent", userId: "cook", name: "New" });
      return originalBatch(statements);
    });

    const { recipeId } = await mutate(method, ["New", " New "]);

    expect(test.sqlite.prepare("SELECT tagId FROM RecipeTag WHERE recipeId = ?").all(recipeId))
      .toEqual([{ tagId: "concurrent" }]);
    expect((await getMcpRecipe(test.db, "cook", recipeId)).tags).toEqual(["New"]);
  });

  it("supports 100 tags within D1 parameter limits", async () => {
    const bind = vi.spyOn(Object.getPrototypeOf(test.binding.prepare("SELECT 1")), "bind");
    const tags = Array.from({ length: 100 }, (_, index) => `Tag ${index}`);

    const { recipeId } = await mutate(method, tags);

    expect((await getMcpRecipe(test.db, "cook", recipeId)).tags).toEqual([...tags].sort());
    for (const params of bind.mock.calls) expect(params.length).toBeLessThanOrEqual(MAX_PARAMS_PER_STATEMENT);
  });

  it("round-trips Unicode, quoted names, and length boundaries while preserving case distinctions", async () => {
    const names = ["Dinner", "dinner", "晚餐", "🥕", "Chef's choice", "'; DROP TABLE Tag; --", "x".repeat(100)];
    const { recipeId } = await mutate(method, names.flatMap((name) => [name, `\t\u2003${name}\u00a0\n`]));

    const saved = await getMcpRecipe(test.db, "cook", recipeId);
    expect(saved.tags).toHaveLength(names.length);
    expect(new Set(saved.tags)).toEqual(new Set(names));
    expect(test.sqlite.prepare("SELECT name FROM Tag WHERE userId = 'other' ORDER BY name").all())
      .toEqual([{ name: "Dinner" }, { name: "Private" }, { name: "Soup" }]);
  });

  it.each(["Tag", "RecipeTag"])("rolls back earlier chunks and replaced children on a late %s failure", async (table) => {
    await test.db.insert(recipeTag).values({ recipeId: "existing", tagId: "dinner" });
    const before = snapshot();
    const condition = table === "Tag" ? "NEW.name = 'Tag 70'" : "(SELECT name FROM Tag WHERE id = NEW.tagId) = 'Tag 70'";
    test.sqlite.exec(`CREATE TRIGGER fail_late_tags BEFORE INSERT ON ${table}
      WHEN ${condition} BEGIN SELECT RAISE(ABORT, 'injected late tag failure'); END;`);
    const input = {
      title: "Rejected replacement",
      ingredients: [{ quantity: 2, unit: "TSP" as const, displayText: "salt" }],
      instructions: ["Rejected instruction"],
      tags: Array.from({ length: 100 }, (_, index) => `Tag ${index}`),
    };

    await expect(method === "create"
      ? createMcpRecipe(test.db, "cook", input)
      : editMcpRecipe(test.db, "cook", { ...input, recipeId: "existing" }))
      .rejects.toThrow(/injected late tag failure/);

    expect(snapshot()).toEqual(before);
  });

  it.each(["Tag", "RecipeTag"])("rolls back all recipe and tag writes when %s insertion fails", async (table) => {
    await test.db.insert(recipeTag).values({ recipeId: "existing", tagId: "dinner" });
    const before = snapshot();
    test.sqlite.exec(`CREATE TRIGGER fail_tags BEFORE INSERT ON ${table}
      BEGIN SELECT RAISE(ABORT, 'injected tag failure'); END;`);

    await expect(mutate(method, ["New"])).rejects.toThrow(/injected tag failure/);

    expect(snapshot()).toEqual(before);
  });
});

describe("MCP tag editing and ownership", () => {
  it("replaces tags idempotently, preserves omitted tags, and clears only the recipe's associations", async () => {
    await test.db.insert(recipeTag).values({ recipeId: "existing", tagId: "dinner" });
    const otherRecipe = await createMcpRecipe(test.db, "cook", { ...recipeInput, tags: ["Dinner"] });
    await editMcpRecipe(test.db, "cook", { recipeId: "existing", tags: ["Soup", "New", " Soup "] });
    const savedTags = await test.db.select().from(tag);
    await editMcpRecipe(test.db, "cook", { recipeId: "existing", tags: ["Soup", "New"] });
    expect(await test.db.select().from(tag)).toEqual(savedTags);
    expect((await getMcpRecipe(test.db, "cook", "existing")).tags).toEqual(["New", "Soup"]);
    const associations = await test.db.select().from(recipeTag);

    await editMcpRecipe(test.db, "cook", { recipeId: "existing", notes: "Leave tags alone." });

    expect(await test.db.select().from(recipeTag)).toEqual(associations);
    await editMcpRecipe(test.db, "cook", { recipeId: "existing", tags: [] });
    expect((await getMcpRecipe(test.db, "cook", "existing")).tags).toEqual([]);
    expect((await getMcpRecipe(test.db, "cook", otherRecipe.recipeId)).tags).toEqual(["Dinner"]);
    expect(await test.db.select().from(tag)).toEqual(savedTags);
    expect(await test.db.select().from(recipeIngredient)).toHaveLength(2);
    expect(await test.db.select().from(recipeInstruction)).toHaveLength(2);
  });

  it.each(["existing", "missing"])("rejects another account's edits and reads without creating tags: %s", async (recipeId) => {
    const before = snapshot();
    const batch = vi.spyOn(test.binding, "batch");

    await expect(editMcpRecipe(test.db, "other", { recipeId, tags: ["Must not exist"] }))
      .rejects.toBeInstanceOf(RecipeNotFoundError);
    await expect(getMcpRecipe(test.db, "other", recipeId)).rejects.toBeInstanceOf(RecipeNotFoundError);

    expect(batch).not.toHaveBeenCalled();
    expect(snapshot()).toEqual(before);
  });

  it("excludes foreign tags from readback even if an invalid association exists", async () => {
    await test.db.insert(recipeTag).values([
      { recipeId: "existing", tagId: "dinner" },
      { recipeId: "existing", tagId: "private" },
    ]);

    expect((await getMcpRecipe(test.db, "cook", "existing")).tags).toEqual(["Dinner"]);
  });
});
