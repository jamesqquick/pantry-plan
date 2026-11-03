import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { createTestDb } from "./d1";

let test: ReturnType<typeof createTestDb>;
afterEach(() => test?.sqlite.close());

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
