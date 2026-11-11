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

it.each([
  "0010_order_total_cost.sql",
  "0011_order_total_default_zero.sql",
])("preserves legacy ingredients, receipts, and orders when upgrading after %s", (lastApplied) => {
  const sqlite = new DatabaseSync(":memory:");
  const migrationsDir = path.join(__dirname, "../db/migrations");
  const migrations = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
  try {
    sqlite.exec("PRAGMA foreign_keys = ON");
    for (const name of migrations.filter((name) => name <= lastApplied)) {
      sqlite.exec(readFileSync(path.join(migrationsDir, name), "utf8"));
    }
    sqlite.exec(`
      INSERT INTO user (id, name, email, createdAt, updatedAt)
        VALUES ('cook', 'Cook', 'cook@example.test', 1, 1), ('other', 'Other', 'other@example.test', 2, 2);
      INSERT INTO Ingredient (id, name, normalizedName, costBasisUnit, estimatedCentsPerBasisUnit, gramsPerCup, cupsPerEach, preferredDisplayUnit)
        VALUES ('flour', 'Flour', 'flour', 'G', 0.3995, 120, 0.5, 'TBSP');
      INSERT INTO Ingredient (id, userId, name, normalizedName, costBasisUnit, estimatedCentsPerBasisUnit)
        VALUES ('eggs', 'cook', 'Eggs', 'eggs', 'COUNT', 28.5);
      INSERT INTO Recipe (id, userId, title) VALUES ('bread', 'cook', 'Bread'), ('buns', 'other', 'Buns');
      INSERT INTO RecipeIngredient (id, recipeId, ingredientId, displayText, rawText, quantity, unit, sortOrder)
        VALUES ('flour-line', 'bread', 'flour', 'Half a cup of flour', '1/2 cup flour', 0.5, 'CUP', 0),
          ('egg-line', 'bread', 'eggs', 'One egg', '1 egg', 1, 'COUNT', 1);
      INSERT INTO MutationOperation (userId, operationId, kind, requestHash, resourceId, createdAt)
        VALUES ('cook', 'saved-operation', 'recipes.create', 'saved-hash', 'bread', 123);
      INSERT INTO MutationOperation (userId, operationId, kind, requestHash, status, createdAt)
        VALUES ('other', 'cancelled-operation', 'orders.create', 'cancelled-hash', 'cancelled', 124);
      INSERT INTO "Order" (id, userId, name, notes, customerName, customerContact, dueDate, dueTime, fulfillmentMethod, deliveryAddress, createdAt, updatedAt)
        VALUES ('legacy-order', 'cook', 'Legacy order', 'Keep these notes', 'Customer', 'customer@example.test', '2026-11-12', '09:30', 'DELIVERY', '123 Main St', 11, 12);
      INSERT INTO "Order" (id, userId, totalCostCents, createdAt, updatedAt)
        VALUES ('zero-order', 'cook', 0, 21, 22), ('priced-order', 'other', 1299, 31, 32);
      INSERT INTO OrderItem (id, orderId, recipeId, batches, createdAt, updatedAt)
        VALUES ('legacy-item', 'legacy-order', 'bread', 0.5, 41, 42),
          ('zero-item', 'zero-order', 'bread', 0.5, 43, 44),
          ('priced-item', 'priced-order', 'buns', 1.5, 45, 46);
    `);
    expect(sqlite.prepare('SELECT totalCostCents FROM "Order" WHERE id = ?').get("legacy-order"))
      .toEqual({ totalCostCents: lastApplied === "0010_order_total_cost.sql" ? null : 0 });
    const users = sqlite.prepare("SELECT * FROM user ORDER BY id").all();
    const ingredients = sqlite.prepare("SELECT * FROM Ingredient ORDER BY id").all();
    const recipes = sqlite.prepare("SELECT * FROM Recipe ORDER BY id").all();
    const lines = sqlite.prepare("SELECT * FROM RecipeIngredient ORDER BY id").all();
    const receipts = sqlite.prepare("SELECT * FROM MutationOperation ORDER BY userId, operationId").all();
    const orders = sqlite.prepare('SELECT * FROM "Order" ORDER BY id').all();
    const items = sqlite.prepare("SELECT * FROM OrderItem ORDER BY id").all();

    for (const name of migrations.filter((name) => name > lastApplied)) {
      sqlite.exec(`BEGIN; ${readFileSync(path.join(migrationsDir, name), "utf8")} COMMIT;`);
    }

    for (const [index, row] of sqlite.prepare("SELECT * FROM Ingredient ORDER BY id").all().entries()) {
      const { gramsPerEach, purchasePriceCents, purchaseQuantity, purchaseUnit, volumeAmount, volumeUnit, volumeWeightGrams, ...legacy } = row;
      expect(legacy).toEqual(ingredients[index]);
      expect([gramsPerEach, purchasePriceCents, purchaseQuantity, purchaseUnit, volumeAmount, volumeUnit, volumeWeightGrams])
        .toEqual(Array(7).fill(null));
    }
    expect(sqlite.prepare("SELECT * FROM user ORDER BY id").all()).toEqual(users);
    expect(sqlite.prepare("SELECT * FROM Recipe ORDER BY id").all()).toEqual(recipes);
    expect(sqlite.prepare("SELECT * FROM RecipeIngredient ORDER BY id").all()).toEqual(lines);
    expect(sqlite.prepare("SELECT * FROM MutationOperation ORDER BY userId, operationId").all()).toEqual(receipts);
    expect(sqlite.prepare('SELECT * FROM "Order" ORDER BY id').all()).toEqual(
      orders.map((row) => ({ ...row, totalCostCents: row.totalCostCents ?? 0 })),
    );
    expect(sqlite.prepare("SELECT * FROM OrderItem ORDER BY id").all()).toEqual(items);
    expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    sqlite.close();
  }
});

it("keeps every table in the final snapshot consistent with the migrated database", () => {
  test = createTestDb();
  const metaDir = path.join(__dirname, "../db/migrations/meta");
  const latestSnapshot = readdirSync(metaDir).filter((name) => name.endsWith("_snapshot.json")).sort().at(-1)!;
  const snapshot = JSON.parse(readFileSync(path.join(metaDir, latestSnapshot), "utf8")) as {
    tables: Record<string, {
      columns: Record<string, { type: string; notNull: boolean; primaryKey: boolean; default?: string | number | boolean }>;
      compositePrimaryKeys: Record<string, { columns: string[] }>;
      indexes: Record<string, { columns: string[]; isUnique: boolean }>;
      foreignKeys: Record<string, { tableTo: string; columnsFrom: string[]; columnsTo: string[]; onUpdate: string; onDelete: string }>;
    }>;
  };

  expect(test.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all()
    .map((row) => row.name).sort()).toEqual(Object.keys(snapshot.tables).sort());
  for (const [name, table] of Object.entries(snapshot.tables)) {
    const columns = test.sqlite.prepare(`PRAGMA table_info("${name}")`).all() as {
      name: string; type: string; notnull: number; pk: number; dflt_value: string | null;
    }[];
    expect(Object.keys(table.columns).sort()).toEqual(columns.map((column) => column.name).sort());
    for (const column of columns) {
      const expected = table.columns[column.name]!;
      expect(expected).toMatchObject({
        type: column.type.toLowerCase(), notNull: Boolean(column.notnull),
      });
      expect(column.dflt_value?.replace(/^\((.*)\)$/s, "$1") ?? null).toBe(expected.default === undefined
        ? null : String(expected.default).replace(/^\((.*)\)$/s, "$1"));
    }
    const primaryKeyColumns = Object.values(table.compositePrimaryKeys)[0]?.columns
      ?? Object.keys(table.columns).filter((name) => table.columns[name]!.primaryKey);
    expect(columns.filter((column) => column.pk > 0).sort((a, b) => a.pk - b.pk).map((column) => column.name))
      .toEqual(primaryKeyColumns);
    const indexes = test.sqlite.prepare(`PRAGMA index_list("${name}")`).all() as { name: string; unique: number; origin: string }[];
    expect(indexes.filter((index) => index.origin === "c").map((index) => index.name).sort())
      .toEqual(Object.keys(table.indexes).sort());
    for (const index of indexes.filter((index) => index.origin === "c")) {
      expect(Boolean(index.unique)).toBe(table.indexes[index.name]!.isUnique);
      expect(test.sqlite.prepare(`PRAGMA index_info("${index.name}")`).all().map((column) => column.name))
        .toEqual(table.indexes[index.name]!.columns);
    }
    const foreignKeys = test.sqlite.prepare(`PRAGMA foreign_key_list("${name}")`).all() as {
      table: string; from: string; to: string; on_update: string; on_delete: string;
    }[];
    expect(foreignKeys.map((key) => ({
      table: key.table, from: key.from, to: key.to,
      on_update: key.on_update.toLowerCase(), on_delete: key.on_delete.toLowerCase(),
    })).sort((a, b) => a.from.localeCompare(b.from))).toEqual(
      Object.values(table.foreignKeys).flatMap((key) => key.columnsFrom.map((from, index) => ({
        table: key.tableTo, from, to: key.columnsTo[index], on_update: key.onUpdate, on_delete: key.onDelete,
      }))).sort((a, b) => a.from.localeCompare(b.from)),
    );
  }
});

it("appends the ingredient snapshots and journal entries after main's order migrations", () => {
  const migrationsDir = path.join(__dirname, "../db/migrations");
  const metaDir = path.join(migrationsDir, "meta");
  const snapshots = Object.fromEntries(readdirSync(metaDir).filter((name) => name.endsWith("_snapshot.json"))
    .map((name) => [name, JSON.parse(readFileSync(path.join(metaDir, name), "utf8")) as { id: string; prevId: string }]));
  const main = snapshots["0011_snapshot.json"]!;
  const itemWeight = snapshots["0012_snapshot.json"]!;
  const packagePricing = snapshots["0013_snapshot.json"]!;
  expect(itemWeight.prevId).toBe(main.id);
  expect(packagePricing.prevId).toBe(itemWeight.id);
  expect(new Set(Object.values(snapshots).map((snapshot) => snapshot.id)).size).toBe(Object.keys(snapshots).length);

  const journal = JSON.parse(readFileSync(path.join(metaDir, "_journal.json"), "utf8")) as {
    entries: { idx: number; tag: string; when: number }[];
  };
  const entries = [11, 12, 13].map((idx) => journal.entries.find((entry) => entry.idx === idx)!);
  expect(entries.map(({ idx, tag }) => ({ idx, tag }))).toEqual([
    { idx: 11, tag: "0011_order_total_default_zero" },
    { idx: 12, tag: "0012_ingredient_item_weight" },
    { idx: 13, tag: "0013_ingredient_package_pricing" },
  ]);
  expect(entries[1]!.when).toBeGreaterThan(entries[0]!.when);
  expect(entries[2]!.when).toBeGreaterThan(entries[1]!.when);
  expect(journal.entries.map((entry) => `${entry.tag}.sql`))
    .toEqual(readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort());
});
