import { afterEach, describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const migrationsDir = path.resolve(__dirname);
const defaultZeroMigration = "0011_order_total_default_zero.sql";
let sqlite: DatabaseSync | undefined;

afterEach(() => {
  sqlite?.close();
  sqlite = undefined;
});

describe("order total default migration", () => {
  it("backfills legacy orders, defaults new rows to zero, and preserves item references", () => {
    sqlite = new DatabaseSync(":memory:");
    sqlite.exec("PRAGMA foreign_keys = ON");

    const files = readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();
    for (const file of files) {
      if (file === defaultZeroMigration) break;
      const migration = readFileSync(path.join(migrationsDir, file), "utf8");
      for (const statement of migration.split("--> statement-breakpoint")) {
        if (statement.trim()) sqlite.exec(statement);
      }
    }

    sqlite.exec(`
      INSERT INTO user (id, name, email, createdAt, updatedAt)
        VALUES ('cook', 'Cook', 'cook@example.test', 1, 1);
      INSERT INTO Recipe (id, userId, title)
        VALUES ('recipe-123', 'cook', 'Cookies');
      INSERT INTO "Order" (id, userId, name)
        VALUES ('legacy-order', 'cook', 'Legacy order');
      INSERT INTO OrderItem (id, orderId, recipeId, batches)
        VALUES ('legacy-item', 'legacy-order', 'recipe-123', 1);
    `);

    const migration = readFileSync(path.join(migrationsDir, defaultZeroMigration), "utf8");
    sqlite.exec("BEGIN");
    try {
      for (const statement of migration.split("--> statement-breakpoint")) {
        if (statement.trim()) sqlite.exec(statement);
      }
      sqlite.exec("COMMIT");
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }

    expect(sqlite.prepare('SELECT totalCostCents FROM "Order" WHERE id = ?').get("legacy-order"))
      .toEqual({ totalCostCents: 0 });
    expect(sqlite.prepare("SELECT orderId FROM OrderItem WHERE id = ?").get("legacy-item"))
      .toEqual({ orderId: "legacy-order" });
    expect(sqlite.prepare("PRAGMA foreign_key_check").all()).toEqual([]);

    const totalColumn = sqlite.prepare('PRAGMA table_info("Order")').all()
      .find((column) => column.name === "totalCostCents");
    expect(totalColumn).toMatchObject({ notnull: 1, dflt_value: "0" });

    sqlite.prepare('INSERT INTO "Order" (id, userId, name) VALUES (?, ?, ?)')
      .run("new-order", "cook", "New order");
    expect(sqlite.prepare('SELECT totalCostCents FROM "Order" WHERE id = ?').get("new-order"))
      .toEqual({ totalCostCents: 0 });
    expect(() => sqlite!.prepare(
      'INSERT INTO "Order" (id, userId, totalCostCents) VALUES (?, ?, NULL)',
    ).run("null-total-order", "cook")).toThrow();
  });
});
