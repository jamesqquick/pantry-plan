import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, expect, it } from "vitest";

const migrationsDir = path.resolve(__dirname);
let sqlite: DatabaseSync | undefined;

afterEach(() => {
  sqlite?.close();
  sqlite = undefined;
});

function applyMigration(db: DatabaseSync, file: string) {
  const migration = readFileSync(path.join(migrationsDir, file), "utf8");
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) db.exec(statement);
  }
}

function databaseBefore(migration: string) {
  const db = sqlite = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");

  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    if (file === migration) break;
    applyMigration(db, file);
  }
  return db;
}

it("drops create tracking from databases that already have the legacy table", () => {
  const migration = "0014_drop_mutation_operations.sql";
  const db = databaseBefore(migration);

  db.exec(`
    INSERT INTO user (id, name, email, createdAt, updatedAt)
      VALUES ('cook', 'Cook', 'cook@example.test', 1, 1);
    INSERT INTO MutationOperation (userId, operationId, kind, requestHash)
      VALUES ('cook', 'old-operation', 'recipes.create', 'old-hash');
  `);

  applyMigration(db, migration);

  expect(db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'MutationOperation'
  `).get()).toBeUndefined();
});

it("keeps existing and new recipes private and reserves assigned slugs after unpublishing", () => {
  const migration = "0017_recipe_visibility.sql";
  const db = databaseBefore(migration);
  db.exec(`
    INSERT INTO user (id, name, email, createdAt, updatedAt) VALUES
      ('cook', 'Cook', 'cook@example.test', 1, 1),
      ('other', 'Other', 'other@example.test', 1, 1);
    INSERT INTO Recipe (id, userId, title) VALUES ('existing', 'cook', 'Soup');
  `);

  applyMigration(db, migration);
  db.exec("INSERT INTO Recipe (id, userId, title) VALUES ('new', 'other', 'Salad')");

  const state = db.prepare("SELECT id, title, isPublic, publicSlug, publishedAt FROM Recipe ORDER BY id");
  expect(state.all()).toEqual([
    { id: "existing", title: "Soup", isPublic: 0, publicSlug: null, publishedAt: null },
    { id: "new", title: "Salad", isPublic: 0, publicSlug: null, publishedAt: null },
  ]);

  const publishedAt = 1795600000123;
  db.prepare("UPDATE Recipe SET isPublic = 1, publicSlug = 'soup-slug', publishedAt = ? WHERE id = 'existing'")
    .run(publishedAt);
  db.exec("UPDATE Recipe SET isPublic = 0 WHERE id = 'existing'");

  expect(state.all()[0]).toEqual({
    id: "existing", title: "Soup", isPublic: 0, publicSlug: "soup-slug", publishedAt,
  });
  expect(() => db.exec("UPDATE Recipe SET publicSlug = 'soup-slug' WHERE id = 'new'"))
    .toThrow(/UNIQUE constraint failed: Recipe.publicSlug/);
});
