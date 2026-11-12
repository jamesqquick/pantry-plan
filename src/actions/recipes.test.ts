import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionAPIContext } from "astro:actions";
import { createDb, type Db } from "@/db";
import { MAX_PARAMS_PER_STATEMENT } from "@/db/chunked-insert";
import { DatabaseBudget, DatabaseTimeoutError, withDatabaseBudget } from "@/lib/database-timeout";
import { createTestDb } from "@/test/d1";
import { recipes } from "./recipes";

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

let test: ReturnType<typeof createTestDb>;
const ctx = {
  [Symbol.for("astro.actionAPIContext")]: true,
  locals: { user: { id: "cook" } },
} as unknown as ActionAPIContext;

beforeEach(() => {
  test = createTestDb();
  runtime.db = test.db;
  runtime.queueSearchSync.mockReset();
  test.sqlite.exec(`
    INSERT INTO user (id, name, email, createdAt, updatedAt) VALUES
      ('cook', 'Cook', 'cook@example.test', 1, 1),
      ('other', 'Other', 'other@example.test', 1, 1);
    INSERT INTO Recipe (id, userId, title, sourceUrl, servings, notes) VALUES
      ('existing', 'cook', 'Original soup', 'https://example.test/soup', 4, 'Original notes'),
      ('foreign', 'other', 'Private soup', NULL, 2, NULL);
    INSERT INTO RecipeInstruction (id, recipeId, sortOrder, text)
      VALUES ('old-instruction', 'existing', 0, 'Original instruction');
    INSERT INTO RecipeIngredient (id, recipeId, quantity, unit, displayText, sortOrder)
      VALUES ('old-ingredient', 'existing', 1, 'TSP', 'Original ingredient', 0);
    INSERT INTO Tag (id, userId, name) VALUES
      ('old-tag', 'cook', 'Original tag'), ('foreign-tag', 'other', 'Private tag');
    INSERT INTO RecipeTag (id, recipeId, tagId)
      VALUES ('old-recipe-tag', 'existing', 'old-tag');
    INSERT INTO Ingredient (id, userId, name, normalizedName, costBasisUnit)
      VALUES ('foreign-ingredient', 'other', 'Private ingredient', 'private ingredient', 'G');
  `);
  const insertIngredient = test.sqlite.prepare(`
    INSERT INTO Ingredient (id, userId, name, normalizedName, costBasisUnit) VALUES (?, ?, ?, ?, 'G')
  `);
  for (let index = 0; index < 99; index++) {
    insertIngredient.run(`ingredient-${index}`, index === 98 ? null : "cook", `Ingredient ${index}`, `ingredient ${index}`);
  }
  const insertTag = test.sqlite.prepare("INSERT INTO Tag (id, userId, name) VALUES (?, 'cook', ?)");
  for (let index = 0; index < 50; index++) insertTag.run(`tag-${index}`, `Tag ${index}`);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  test.sqlite.close();
});

function snapshot() {
  return {
    recipes: test.sqlite.prepare("SELECT * FROM Recipe ORDER BY id").all(),
    instructions: test.sqlite.prepare("SELECT * FROM RecipeInstruction ORDER BY id").all(),
    ingredients: test.sqlite.prepare("SELECT * FROM RecipeIngredient ORDER BY id").all(),
    catalogIngredients: test.sqlite.prepare("SELECT * FROM Ingredient ORDER BY id").all(),
    tags: test.sqlite.prepare("SELECT * FROM RecipeTag ORDER BY id").all(),
  };
}

function submittedRecipe() {
  return {
    title: "Changed soup",
    notes: "Changed notes",
    instructions: Array.from({ length: 45 }, (_, index) => `  Step ${index}  `),
    ingredientsStructured: Array.from({ length: 100 }, (_, index) => ({
      ingredientId: index === 99 ? "" : `ingredient-${index}`,
      quantity: 1 / 3,
      unit: "TSP" as const,
      displayText: `  Ingredient ${index}  `,
      rawText: `  1/3 tsp ingredient ${index}  `,
      sortOrder: index,
    })),
    tagIds: Array.from({ length: 50 }, (_, index) => `tag-${index}`),
  };
}

type SubmittedRecipe = ReturnType<typeof submittedRecipe> & {
  ingredientsStructured: Array<
    ReturnType<typeof submittedRecipe>["ingredientsStructured"][number] & {
      createIngredientName?: string;
    }
  >;
};

function mutate(method: "create" | "update", input: SubmittedRecipe = submittedRecipe()) {
  return method === "create"
    ? recipes.create.orThrow.call(ctx, { ...input, accountId: "cook", operationId: crypto.randomUUID() })
    : recipes.update.orThrow.call(ctx, { id: "existing", ...input });
}

function expectSubmittedRecipe(recipeId: string) {
  expect(test.sqlite.prepare("SELECT title, notes FROM Recipe WHERE id = ?").get(recipeId))
    .toEqual({ title: "Changed soup", notes: "Changed notes" });
  const instructions = test.sqlite.prepare("SELECT text FROM RecipeInstruction WHERE recipeId = ? ORDER BY sortOrder").all(recipeId);
  expect(instructions.map((row) => row.text)).toEqual(submittedRecipe().instructions.map((text) => text.trim()));
  const ingredients = test.sqlite.prepare("SELECT * FROM RecipeIngredient WHERE recipeId = ? ORDER BY sortOrder").all(recipeId);
  expect(ingredients).toHaveLength(100);
  expect(ingredients[0]).toMatchObject({ ingredientId: "ingredient-0", quantity: 1 / 3, unit: "TSP", displayText: "Ingredient 0", rawText: "  1/3 tsp ingredient 0  " });
  expect(ingredients[98]).toMatchObject({ ingredientId: "ingredient-98" });
  expect(ingredients[99]).toMatchObject({ ingredientId: null });
  const tags = test.sqlite.prepare("SELECT tagId FROM RecipeTag WHERE recipeId = ? ORDER BY tagId").all(recipeId);
  expect(tags.map((row) => row.tagId)).toEqual(submittedRecipe().tagIds.sort());
}

describe.each(["create", "update"] as const)("atomic recipe %s", (method) => {
  it("commits all submitted fields in one batch before search sync, within parameter limits", async () => {
    const batch = vi.spyOn(test.binding, "batch");
    const bind = vi.spyOn(Object.getPrototypeOf(test.binding.prepare("SELECT 1")), "bind");
    runtime.queueSearchSync.mockImplementationOnce(async () => {
      const row = test.sqlite.prepare("SELECT id FROM Recipe WHERE title = 'Changed soup'").get();
      expectSubmittedRecipe(row!.id as string);
    });

    const result = await mutate(method);

    expectSubmittedRecipe(result.id);
    expect(batch).toHaveBeenCalledOnce();
    expect(runtime.queueSearchSync).toHaveBeenCalledExactlyOnceWith(ctx, runtime.db, [result.id]);
    for (const params of bind.mock.calls) expect(params.length).toBeLessThanOrEqual(MAX_PARAMS_PER_STATEMENT);
  });

  it.each([
    ["RecipeInstruction", "NEW.sortOrder = 0"],
    ["RecipeInstruction", "NEW.sortOrder = 30"],
    ["RecipeIngredient", "NEW.sortOrder = 0"],
    ["RecipeIngredient", "NEW.sortOrder = 30"],
    ["RecipeTag", "NEW.tagId = 'tag-0'"],
    ["RecipeTag", "NEW.tagId = 'tag-35'"],
  ])("rolls back every write when inserting %s fails at %s", async (table, condition) => {
    const before = snapshot();
    test.sqlite.exec(`CREATE TRIGGER fail_child BEFORE INSERT ON ${table}
      WHEN ${condition} BEGIN SELECT RAISE(ABORT, 'injected child failure'); END;`);

    await expect(mutate(method)).rejects.toThrow(/injected child failure/);

    expect(snapshot()).toEqual(before);
    expect(runtime.queueSearchSync).not.toHaveBeenCalled();
  });

  it("leaves all rows unchanged when the core write fails", async () => {
    const before = snapshot();
    test.sqlite.exec(`CREATE TRIGGER fail_core BEFORE ${method === "create" ? "INSERT" : "UPDATE"} ON Recipe
      BEGIN SELECT RAISE(ABORT, 'injected core failure'); END;`);

    await expect(mutate(method)).rejects.toThrow(/injected core failure/);

    expect(snapshot()).toEqual(before);
    expect(runtime.queueSearchSync).not.toHaveBeenCalled();
  });

  it("finishes tag validation before any mutation", async () => {
    const before = snapshot();
    const prepare = test.binding.prepare.bind(test.binding);
    vi.spyOn(test.binding, "prepare").mockImplementation((query) => {
      if (/select .* from "Tag"/i.test(query)) throw new TypeError("Tag lookup failed");
      return prepare(query);
    });
    const batch = vi.spyOn(test.binding, "batch");

    await expect(mutate(method)).rejects.toThrow(/Tag lookup failed/);

    expect(batch).not.toHaveBeenCalled();
    expect(snapshot()).toEqual(before);
    expect(runtime.queueSearchSync).not.toHaveBeenCalled();
  });

  it.each(["foreign-ingredient", "missing-ingredient"])("rejects an inaccessible ingredient %s before any mutation", async (ingredientId) => {
    const before = snapshot();
    const input = submittedRecipe();
    input.ingredientsStructured[95]!.ingredientId = ingredientId;
    const batch = vi.spyOn(test.binding, "batch");

    await expect(mutate(method, input)).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(batch).not.toHaveBeenCalled();
    expect(snapshot()).toEqual(before);
    expect(runtime.queueSearchSync).not.toHaveBeenCalled();
  });

  it("filters foreign and missing tags without changing valid assignments", async () => {
    const input = submittedRecipe();
    input.tagIds = ["tag-0", "foreign-tag", "missing-tag"];

    const result = await mutate(method, input);

    expect(test.sqlite.prepare("SELECT tagId FROM RecipeTag WHERE recipeId = ?").all(result.id))
      .toEqual([{ tagId: "tag-0" }]);
  });

  it("allows repeated references to the same accessible ingredient", async () => {
    const input = submittedRecipe();
    for (const item of input.ingredientsStructured) item.ingredientId = "ingredient-0";

    const result = await mutate(method, input);

    expect(test.sqlite.prepare("SELECT ingredientId FROM RecipeIngredient WHERE recipeId = ?").all(result.id))
      .toEqual(Array.from({ length: 100 }, () => ({ ingredientId: "ingredient-0" })));
  });

  it("creates staged catalog ingredients in the recipe batch and preserves recipe line text", async () => {
    const input: SubmittedRecipe = submittedRecipe();
    input.ingredientsStructured[0] = {
      ...input.ingredientsStructured[0]!,
      ingredientId: "",
      createIngredientName: "Wild fennel",
    };
    input.ingredientsStructured[1] = {
      ...input.ingredientsStructured[1]!,
      ingredientId: "",
      createIngredientName: " WILD FENNEL ",
    };
    const batch = vi.spyOn(test.binding, "batch");

    const result = await mutate(method, input);

    const created = test.sqlite.prepare(
      "SELECT id, userId, name, normalizedName, costBasisUnit FROM Ingredient WHERE normalizedName = 'wild fennel'",
    ).all();
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      userId: "cook",
      name: "Wild fennel",
      normalizedName: "wild fennel",
      costBasisUnit: "G",
    });
    const recipeLines = test.sqlite.prepare(
      "SELECT ingredientId, displayText FROM RecipeIngredient WHERE recipeId = ? ORDER BY sortOrder LIMIT 2",
    ).all(result.id);
    expect(recipeLines).toEqual([
      { ingredientId: created[0]!.id, displayText: "Ingredient 0" },
      { ingredientId: created[0]!.id, displayText: "Ingredient 1" },
    ]);
    expect(batch).toHaveBeenCalledOnce();
    expect(runtime.queueSearchSync).toHaveBeenCalledOnce();
  });

  it("rolls back staged catalog ingredients when a later recipe write fails", async () => {
    const before = snapshot();
    const input: SubmittedRecipe = submittedRecipe();
    input.ingredientsStructured[0] = {
      ...input.ingredientsStructured[0]!,
      ingredientId: "",
      createIngredientName: "Wild fennel",
    };
    test.sqlite.exec(`CREATE TRIGGER fail_staged_ingredient BEFORE INSERT ON Ingredient
      WHEN NEW.normalizedName = 'wild fennel' BEGIN SELECT RAISE(ABORT, 'injected ingredient failure'); END;`);

    await expect(mutate(method, input)).rejects.toThrow(/injected ingredient failure/);

    expect(snapshot()).toEqual(before);
    expect(runtime.queueSearchSync).not.toHaveBeenCalled();
  });

  it("does not submit any writes when validation reads time out", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const before = snapshot();
    const raw = vi.spyOn(Object.getPrototypeOf(test.binding.prepare("SELECT 1")), "raw")
      .mockImplementationOnce(() => new Promise(() => {}));
    const batch = vi.spyOn(test.binding, "batch");
    const budget = new DatabaseBudget({}, 100);
    const operation = withDatabaseBudget(budget, () => {
      runtime.db = createDb(test.binding);
      return mutate(method);
    });
    const assertion = expect(operation).rejects.toBeInstanceOf(DatabaseTimeoutError);

    await vi.waitFor(() => expect(raw).toHaveBeenCalledOnce(), { interval: 1 });
    await vi.advanceTimersByTimeAsync(100);
    await assertion;

    expect(budget.writeStarted).toBe(false);
    expect(raw).toHaveBeenCalledOnce();
    expect(batch).not.toHaveBeenCalled();
    expect(snapshot()).toEqual(before);
    expect(runtime.queueSearchSync).not.toHaveBeenCalled();
  });

  it.each(["commit", "roll back"] as const)("allows an unknown batch outcome to %s late without retries or search sync", async (outcome) => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const before = snapshot();
    if (outcome === "roll back") {
      test.sqlite.exec(`CREATE TRIGGER fail_late BEFORE INSERT ON RecipeTag
        WHEN NEW.tagId = 'tag-35' BEGIN SELECT RAISE(ABORT, 'injected late failure'); END;`);
    }
    const prepare = vi.spyOn(test.binding, "prepare");
    const originalBatch = test.binding.batch.bind(test.binding);
    let complete!: () => Promise<void>;
    const batch = vi.spyOn(test.binding, "batch").mockImplementationOnce((statements) => new Promise((resolve, reject) => {
      complete = async () => { await originalBatch(statements).then(resolve, reject); };
    }));
    const budget = new DatabaseBudget({}, 100);
    const operation = withDatabaseBudget(budget, () => {
      runtime.db = createDb(test.binding);
      return mutate(method);
    });
    const assertion = expect(operation).rejects.toBeInstanceOf(DatabaseTimeoutError);
    await vi.waitFor(() => expect(batch).toHaveBeenCalledOnce(), { interval: 1 });
    const initialQueries = prepare.mock.calls.length;

    await vi.advanceTimersByTimeAsync(100);
    await assertion;

    expect(budget.error).toBeInstanceOf(DatabaseTimeoutError);
    expect(budget.writeStarted).toBe(true);
    expect(snapshot()).toEqual(before);
    expect(runtime.queueSearchSync).not.toHaveBeenCalled();

    await complete();
    await vi.runAllTimersAsync();

    if (outcome === "commit") {
      const row = test.sqlite.prepare("SELECT id FROM Recipe WHERE title = 'Changed soup'").get();
      expectSubmittedRecipe(row!.id as string);
    } else {
      expect(snapshot()).toEqual(before);
    }
    expect(prepare).toHaveBeenCalledTimes(initialQueries);
    expect(batch).toHaveBeenCalledOnce();
    expect(runtime.queueSearchSync).not.toHaveBeenCalled();
  });
});

describe("partial recipe mutations", () => {
  it("maps and clears an existing recipe ingredient without changing its recipe line", async () => {
    const line = {
      ingredientId: "ingredient-0",
      quantity: 1 / 3,
      unit: "TSP" as const,
      displayText: "seasoning salt",
      rawText: " 1/3 tsp seasoning salt ",
      sortOrder: 0,
    };

    await recipes.update.orThrow.call(ctx, { id: "existing", ingredientsStructured: [line] });
    expect(test.sqlite.prepare("SELECT ingredientId, quantity, unit, displayText, rawText FROM RecipeIngredient WHERE recipeId = 'existing'").get())
      .toEqual({ ingredientId: "ingredient-0", quantity: 1 / 3, unit: "TSP", displayText: "seasoning salt", rawText: " 1/3 tsp seasoning salt " });

    await recipes.update.orThrow.call(ctx, { id: "existing", ingredientsStructured: [{ ...line, ingredientId: "" }] });
    expect(test.sqlite.prepare("SELECT ingredientId, quantity, unit, displayText, rawText FROM RecipeIngredient WHERE recipeId = 'existing'").get())
      .toEqual({ ingredientId: null, quantity: 1 / 3, unit: "TSP", displayText: "seasoning salt", rawText: " 1/3 tsp seasoning salt " });
  });

  it("creates a recipe without optional children", async () => {
    const { id } = await recipes.create.orThrow.call(ctx, { accountId: "cook", operationId: crypto.randomUUID(), title: "Simple soup", instructions: ["  Cook.  "] });

    expect(test.sqlite.prepare("SELECT text FROM RecipeInstruction WHERE recipeId = ?").all(id)).toEqual([{ text: "Cook." }]);
    expect(test.sqlite.prepare("SELECT * FROM RecipeIngredient WHERE recipeId = ?").all(id)).toEqual([]);
    expect(test.sqlite.prepare("SELECT * FROM RecipeTag WHERE recipeId = ?").all(id)).toEqual([]);
  });

  it("leaves omitted core fields and child arrays unchanged", async () => {
    const before = snapshot();

    await recipes.update.orThrow.call(ctx, { id: "existing", notes: "Edited notes" });

    const after = snapshot();
    expect(after.instructions).toEqual(before.instructions);
    expect(after.ingredients).toEqual(before.ingredients);
    expect(after.tags).toEqual(before.tags);
    expect(test.sqlite.prepare("SELECT title, sourceUrl, servings, notes FROM Recipe WHERE id = 'existing'").get())
      .toEqual({ title: "Original soup", sourceUrl: "https://example.test/soup", servings: 4, notes: "Edited notes" });
  });

  it.each(["instructions", "ingredientsStructured", "tagIds"] as const)("replaces only the supplied %s without core fields", async (field) => {
    const before = snapshot();
    const input = submittedRecipe();
    await recipes.update.orThrow.call(ctx, { id: "existing", [field]: input[field] });

    const after = snapshot();
    expect(after.recipes).toEqual(before.recipes);
    if (field !== "instructions") expect(after.instructions).toEqual(before.instructions);
    if (field !== "ingredientsStructured") expect(after.ingredients).toEqual(before.ingredients);
    if (field !== "tagIds") expect(after.tags).toEqual(before.tags);
    expect(after[field === "ingredientsStructured" ? "ingredients" : field === "tagIds" ? "tags" : field])
      .toHaveLength(input[field].length);
  });

  it("clears explicitly empty ingredients and tags together", async () => {
    const before = snapshot();
    await recipes.update.orThrow.call(ctx, { id: "existing", ingredientsStructured: [], tagIds: [] });

    expect(snapshot()).toEqual({ ...before, ingredients: [], tags: [] });
  });

  it("does not send an empty batch for a no-op update", async () => {
    const before = snapshot();
    const batch = vi.spyOn(test.binding, "batch");

    await recipes.update.orThrow.call(ctx, { id: "existing" });

    expect(snapshot()).toEqual(before);
    expect(batch).not.toHaveBeenCalled();
  });

  it.each(["foreign", "missing"])("rejects updates to an inaccessible recipe %s before writes", async (id) => {
    const before = snapshot();
    const batch = vi.spyOn(test.binding, "batch");

    await expect(recipes.update.orThrow.call(ctx, { id, ...submittedRecipe() })).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(snapshot()).toEqual(before);
    expect(batch).not.toHaveBeenCalled();
    expect(runtime.queueSearchSync).not.toHaveBeenCalled();
  });
});
