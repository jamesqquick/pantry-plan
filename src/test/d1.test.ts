import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it } from "vitest";
import { createTestDb } from "./d1";

let test: ReturnType<typeof createTestDb>;
afterEach(() => { if (test?.sqlite.isOpen) test.sqlite.close(); });

it("never exposes an uncommitted receipt from a batch that rolls back", async () => {
  test = createTestDb();
  test.sqlite.exec("INSERT INTO user (id, name, email, createdAt, updatedAt) VALUES ('cook', 'Cook', 'cook@example.test', 1, 1)");
  const pending = test.binding.batch([
    test.binding.prepare("INSERT INTO MutationOperation (userId, operationId, kind, requestHash, resourceId) VALUES (?, ?, ?, ?, ?)")
      .bind("cook", crypto.randomUUID(), "recipes.create", "hash", "new-recipe"),
    test.binding.prepare("INSERT INTO Recipe (id, userId, title) VALUES (?, ?, ?)")
      .bind("new-recipe", "missing-user", "Soup"),
  ]);
  const concurrentRead = Promise.resolve().then(() =>
    test.binding.prepare("SELECT resourceId FROM MutationOperation").all(),
  );

  await expect(pending).rejects.toThrow(/FOREIGN KEY/);
  expect((await concurrentRead).results).toEqual([]);
  expect(test.sqlite.prepare("SELECT * FROM MutationOperation").all()).toEqual([]);
});

it("preserves existing receipts and resources when adding cancellation support", () => {
  test = createTestDb();
  const migration = (name: string) => readFileSync(path.join(__dirname, "../db/migrations", name), "utf8");
  test.sqlite.exec("DROP TABLE MutationOperation");
  test.sqlite.exec(migration("0008_mutation_operations.sql"));
  test.sqlite.exec(`
    INSERT INTO user (id, name, email, createdAt, updatedAt) VALUES ('cook', 'Cook', 'cook@example.test', 1, 1);
    INSERT INTO Recipe (id, userId, title) VALUES ('saved-recipe', 'cook', 'Soup');
    INSERT INTO MutationOperation (userId, operationId, kind, requestHash, resourceId, createdAt)
      VALUES ('cook', 'original-operation', 'recipes.create', 'original-hash', 'saved-recipe', 123);
  `);

  test.sqlite.exec(`BEGIN; ${migration("0009_mutation_cancellation.sql")} COMMIT;`);

  expect(test.sqlite.prepare("SELECT * FROM MutationOperation").get()).toMatchObject({
    userId: "cook", operationId: "original-operation", kind: "recipes.create",
    requestHash: "original-hash", resourceId: "saved-recipe", createdAt: 123, status: "completed",
  });
  expect(test.sqlite.prepare("SELECT title FROM Recipe WHERE id = 'saved-recipe'").get()).toMatchObject({ title: "Soup" });
  test.sqlite.exec(`INSERT INTO MutationOperation (userId, operationId, kind, requestHash, status)
    VALUES ('cook', 'cancelled-operation', 'recipes.create', '', 'cancelled')`);
  expect(test.sqlite.prepare("SELECT resourceId FROM MutationOperation WHERE status = 'cancelled'").get()).toMatchObject({ resourceId: null });
  test.sqlite.exec("DELETE FROM user WHERE id = 'cook'");
  expect(test.sqlite.prepare("SELECT * FROM MutationOperation").all()).toEqual([]);
});

it("adds optional ingredient pricing without changing legacy data or mutation receipts", () => {
  const sqlite = new DatabaseSync(":memory:");
  const migrationsDir = path.join(__dirname, "../db/migrations");
  try {
    sqlite.exec("PRAGMA foreign_keys = ON");
    for (const name of readdirSync(migrationsDir).filter((name) => name.endsWith(".sql") && name < "0010").sort()) {
      sqlite.exec(readFileSync(path.join(migrationsDir, name), "utf8"));
    }
    sqlite.exec(`
      INSERT INTO user (id, name, email, createdAt, updatedAt) VALUES ('cook', 'Cook', 'cook@example.test', 1, 1);
      INSERT INTO Ingredient (id, name, normalizedName, costBasisUnit, estimatedCentsPerBasisUnit, gramsPerCup, cupsPerEach, preferredDisplayUnit)
        VALUES ('flour', 'Flour', 'flour', 'G', 0.3995, 120, 0.5, 'TBSP');
      INSERT INTO Ingredient (id, userId, name, normalizedName, costBasisUnit)
        VALUES ('eggs', 'cook', 'Eggs', 'eggs', 'COUNT');
      INSERT INTO Recipe (id, userId, title) VALUES ('bread', 'cook', 'Bread');
      INSERT INTO RecipeIngredient (id, recipeId, ingredientId, displayText, rawText, quantity, unit, sortOrder)
        VALUES ('flour-line', 'bread', 'flour', 'Half a cup of flour', '1/2 cup flour', 0.5, 'CUP', 0);
      INSERT INTO MutationOperation (userId, operationId, kind, requestHash, resourceId, createdAt)
        VALUES ('cook', 'saved-operation', 'recipes.create', 'saved-hash', 'bread', 123);
    `);
    const ingredients = sqlite.prepare("SELECT * FROM Ingredient ORDER BY id").all();
    const lines = sqlite.prepare("SELECT * FROM RecipeIngredient").all();
    const receipts = sqlite.prepare("SELECT * FROM MutationOperation").all();

    for (const name of ["0010_ingredient_item_weight.sql", "0011_ingredient_package_pricing.sql"]) {
      sqlite.exec(`BEGIN; ${readFileSync(path.join(migrationsDir, name), "utf8")} COMMIT;`);
    }

    for (const [index, row] of sqlite.prepare("SELECT * FROM Ingredient ORDER BY id").all().entries()) {
      const { gramsPerEach, purchasePriceCents, purchaseQuantity, purchaseUnit, volumeAmount, volumeUnit, volumeWeightGrams, ...legacy } = row;
      expect(legacy).toEqual(ingredients[index]);
      expect([gramsPerEach, purchasePriceCents, purchaseQuantity, purchaseUnit, volumeAmount, volumeUnit, volumeWeightGrams])
        .toEqual(Array(7).fill(null));
    }
    expect(sqlite.prepare("SELECT * FROM RecipeIngredient").all()).toEqual(lines);
    expect(sqlite.prepare("SELECT * FROM MutationOperation").all()).toEqual(receipts);
    expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    sqlite.close();
  }
});

it("keeps the merged ingredient and mutation snapshots consistent with the migrated database", () => {
  test = createTestDb();
  const snapshot = JSON.parse(readFileSync(path.join(__dirname, "../db/migrations/meta/0011_snapshot.json"), "utf8")) as {
    tables: Record<string, { columns: Record<string, { type: string; notNull: boolean }> }>;
  };

  for (const name of ["Ingredient", "MutationOperation", "RecipeIngredient"]) {
    const columns = test.sqlite.prepare(`PRAGMA table_info("${name}")`).all() as { name: string; type: string; notnull: number }[];
    expect(Object.keys(snapshot.tables[name]!.columns).sort()).toEqual(columns.map((column) => column.name).sort());
    for (const column of columns) {
      expect(snapshot.tables[name]!.columns[column.name]).toMatchObject({
        type: column.type.toLowerCase(), notNull: Boolean(column.notnull),
      });
    }
  }
});
