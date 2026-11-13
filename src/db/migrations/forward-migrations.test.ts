import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, expect, it } from "vitest";

const migrationsDir = path.resolve(__dirname);
const dropCreateTrackingMigration = "0014_drop_mutation_operations.sql";
let sqlite: DatabaseSync | undefined;

afterEach(() => {
  sqlite?.close();
  sqlite = undefined;
});

it("drops create tracking from databases that already have the legacy table", () => {
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");

  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    if (file === dropCreateTrackingMigration) break;
    const migration = readFileSync(path.join(migrationsDir, file), "utf8");
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) sqlite.exec(statement);
    }
  }

  sqlite.exec(`
    INSERT INTO user (id, name, email, createdAt, updatedAt)
      VALUES ('cook', 'Cook', 'cook@example.test', 1, 1);
    INSERT INTO MutationOperation (userId, operationId, kind, requestHash)
      VALUES ('cook', 'old-operation', 'recipes.create', 'old-hash');
  `);

  const migration = readFileSync(path.join(migrationsDir, dropCreateTrackingMigration), "utf8");
  sqlite.exec(migration);

  expect(sqlite.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'MutationOperation'
  `).get()).toBeUndefined();
});
